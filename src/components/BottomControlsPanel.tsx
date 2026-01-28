"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"; // Added Accordion
import { PAYMENT_METHODS } from '@/lib/constants'; 
import type { ControlsState, PaymentMethod, ProcessorPaymentMethodMatrix, ProcessorIncidentStatus, StructuredRule, ConditionField, ConditionOperator, MerchantConnector } from '@/lib/types';
import { Settings2, TrendingUp, Zap, VenetianMaskIcon, AlertTriangle, Trash2, Copy } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

const LOCALSTORAGE_SUCCESS_CARD_KEY = 'hyperswitch_successCardDetails';
const LOCALSTORAGE_FAILURE_CARD_KEY = 'hyperswitch_failureCardDetails';

interface GlobalCardDetailsFromStorage {
  successCardNumber?: string;
  successCardExpMonth?: string;
  successCardExpYear?: string;
  successCardHolderName?: string;
  successCardCvc?: string;
  failureCardNumber?: string;
  failureCardExpMonth?: string;
  failureCardExpYear?: string;
  failureCardHolderName?: string;
  failureCardCvc?: string;
}

const loadGlobalCardDetailsFromStorage = (): GlobalCardDetailsFromStorage => {
  const loaded: GlobalCardDetailsFromStorage = {};
  if (typeof window !== 'undefined') {
    try {
      const storedSuccess = localStorage.getItem(LOCALSTORAGE_SUCCESS_CARD_KEY);
      if (storedSuccess) {
        const parsed = JSON.parse(storedSuccess);
        loaded.successCardNumber = parsed.cardNumber;
        loaded.successCardExpMonth = parsed.expMonth;
        loaded.successCardExpYear = parsed.expYear;
        loaded.successCardHolderName = parsed.holderName;
        loaded.successCardCvc = parsed.cvc;
      }
      const storedFailure = localStorage.getItem(LOCALSTORAGE_FAILURE_CARD_KEY);
      if (storedFailure) {
        const parsed = JSON.parse(storedFailure);
        loaded.failureCardNumber = parsed.cardNumber;
        loaded.failureCardExpMonth = parsed.expMonth;
        loaded.failureCardExpYear = parsed.expYear;
        loaded.failureCardHolderName = parsed.holderName;
        loaded.failureCardCvc = parsed.cvc;
      }
    } catch (e) {
      console.error("Error loading card details from localStorage", e);
    }
  }
  return loaded;
};

const formSchema = z.object({
  totalPayments: z.number().min(0).max(1000000),
  selectedPaymentMethods: z.array(z.string()).min(1, "Please select at least one payment method."),
  processorMatrix: z.record(z.string(), z.record(z.string(), z.boolean())),
  ruleConditionField: z.custom<ConditionField>().optional(),
  ruleConditionOperator: z.custom<ConditionOperator>().optional(),
  ruleConditionValue: z.custom<PaymentMethod>().optional(),
  ruleActionProcessorId: z.string().optional(),
  processorIncidents: z.record(z.string(), z.number().nullable()),
  processorWiseSuccessRates: z.record(z.string(), z.object({
    sr: z.number().min(0).max(100), // Base input SR from UI
    srDeviation: z.number().min(0).max(50),
    volumeShare: z.number().min(0).max(100), // Calculated for distribution
    successfulPaymentCount: z.number().min(0), // Actual count
    totalPaymentCount: z.number().min(0),      // Actual count
  })),
  currentBlockThresholdDurationInMins: z.number().min(0).optional(), // Retain for now, but will be replaced by minAggregatesSize for API
  currentBlockThresholdMaxTotalCount: z.number().min(0).max(10000).optional(), // Retain for now, but will be replaced by maxAggregatesSize for API
  minAggregatesSize: z.number().min(0).optional(), // New field for min_aggregates_size
  maxAggregatesSize: z.number().min(0).optional(), // New field for max_aggregates_size
  isSuccessBasedRoutingEnabled: z.boolean().optional(),
  // Global Test Payment Data Fields are removed from schema
  connectorWiseFailurePercentage: z.record(z.string(), z.number()), // Connector-wise failure percentage
  explorationPercent: z.number().min(0).max(100).optional(), // Added explorationPercent
  connectorWiseTestCards: z.record(z.string(), z.object({
    successCard: z.object({
      cardNumber: z.string().optional(),
      expMonth: z.string().optional(),
      expYear: z.string().optional(),
      holderName: z.string().optional(),
      cvc: z.string().optional(),
    }).optional(),
    failureCard: z.object({
      cardNumber: z.string().optional(),
      expMonth: z.string().optional(),
      expYear: z.string().optional(),
      holderName: z.string().optional(),
      cvc: z.string().optional(),
    }).optional(),
  })).optional(),
  selectedRoutingParams: z.object({
    PaymentMethod: z.boolean().optional(),
    PaymentMethodType: z.boolean().optional(),
    AuthenticationType: z.boolean().optional(),
    Currency: z.boolean().optional(),
    Country: z.boolean().optional(),
    CardNetwork: z.boolean().optional(),
    CardBin: z.boolean().optional(),
  }).optional(),
  numberOfBatches: z.number().min(1).optional(),
  batchSize: z.number().min(1).optional(),
});

export type FormValues = Omit<z.infer<typeof formSchema>, 'structuredRule' | 'overallSuccessRate'> & {
  structuredRule: StructuredRule | null;
  overallSuccessRate?: number;
  isSuccessBasedRoutingEnabled?: boolean; // Corrected to match form schema
  explorationPercent?: number; // Ensure it's part of FormValues if not automatically inferred
  connectorWiseTestCards?: Record<string, {
    successCard?: {
      cardNumber?: string;
      expMonth?: string;
      expYear?: string;
      holderName?: string;
      cvc?: string;
    };
    failureCard?: {
      cardNumber?: string;
      expMonth?: string;
      expYear?: string;
      holderName?: string;
      cvc?: string;
    };
  }>;
  minAggregatesSize?: number; // Ensure it's part of FormValues
  maxAggregatesSize?: number; // Ensure it's part of FormValues
  numberOfBatches?: number; // New batch processing field
  batchSize?: number; // New batch processing field
};

interface BottomControlsPanelProps {
  onFormChange: (data: FormValues) => void;
  initialValues?: Partial<FormValues>;
  merchantConnectors: MerchantConnector[];
  connectorToggleStates: Record<string, boolean>; 
  onConnectorToggleChange: (connectorId: string, newState: boolean) => void; 
  apiKey: string; 
  profileId: string; 
  merchantId: string; 
  collapsed?: boolean;
  onToggleCollapse: () => void;
  activeTab: string;
  parentTab?: 'intelligent-routing' | 'least-cost-routing';
}

function formatCardNumber(value: string) {
  // Remove all non-digit characters
  const digits = value.replace(/\D/g, '').slice(0, 16);
  // Insert a space every 4 digits
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

export function BottomControlsPanel({ 
  onFormChange, 
  initialValues,
  merchantConnectors,
  connectorToggleStates, 
  onConnectorToggleChange, 
  apiKey, 
  profileId, 
  merchantId, 
  collapsed = false,
  onToggleCollapse,
  activeTab,
  parentTab = 'intelligent-routing',
}: BottomControlsPanelProps & { activeTab: string; parentTab?: 'intelligent-routing' | 'least-cost-routing' }) {
  const { toast } = useToast();
  const [successBasedAlgorithmId, setSuccessBasedAlgorithmId] = useState<string | null>(null);
  // const [activeRoutingAlgorithm, setActiveRoutingAlgorithm] = useState<any | null>(null); // Removed
  // const [isLoadingActiveRouting, setIsLoadingActiveRouting] = useState<boolean>(false); // Removed
  const dynamicDefaults = useMemo(() => {
    const matrix: ProcessorPaymentMethodMatrix = {};
    const incidents: ProcessorIncidentStatus = {};
    const rates: ControlsState['processorWiseSuccessRates'] = {};
    const connectorWiseFailurePercentage: Record<string, number> = {};
    const connectorWiseTestCardsInit: FormValues['connectorWiseTestCards'] = {};
    
    const globalStoredCards = loadGlobalCardDetailsFromStorage(); // Load global stored cards once

    (merchantConnectors || []).forEach(connector => {
      const key = connector.merchant_connector_id || connector.connector_name;
      matrix[key] = PAYMENT_METHODS.reduce((acc, method) => {
        acc[method] = false; 
        return acc;
      }, {} as Record<PaymentMethod, boolean>);
      incidents[key] = null;
      rates[key] = { sr: 0, srDeviation: 5, volumeShare: 0, successfulPaymentCount: 0, totalPaymentCount: 0 };
      if(connector.disabled == false) {
        // Ensure connector.connector_name is used as the key for failure percentage
        connectorWiseFailurePercentage[connector.connector_name] = 50;
      }
      // Initialize test cards for each connector using global stored cards or hardcoded defaults
      connectorWiseTestCardsInit![key] = {
        successCard: {
          cardNumber: globalStoredCards.successCardNumber || "4242424242424242",
          expMonth: globalStoredCards.successCardExpMonth || "10",
          expYear: globalStoredCards.successCardExpYear || "26",
          holderName: globalStoredCards.successCardHolderName || "Joseph Doe",
          cvc: globalStoredCards.successCardCvc || "123",
        },
        failureCard: {
          cardNumber: globalStoredCards.failureCardNumber || "4000000000000002",
          expMonth: globalStoredCards.failureCardExpMonth || "12",
          expYear: globalStoredCards.failureCardExpYear || "26",
          holderName: globalStoredCards.failureCardHolderName || "Jane Roe",
          cvc: globalStoredCards.failureCardCvc || "999",
        }
      };
    });
    return { matrix, incidents, rates, connectorWiseFailurePercentage, connectorWiseTestCardsInit };
  }, [merchantConnectors]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      totalPayments: 100,
      selectedPaymentMethods: [...PAYMENT_METHODS],
      processorMatrix: dynamicDefaults.matrix,
      processorIncidents: dynamicDefaults.incidents,
      processorWiseSuccessRates: dynamicDefaults.rates,
      currentBlockThresholdDurationInMins: 60, // Default for old field
      currentBlockThresholdMaxTotalCount: 20, // Default for old field
      minAggregatesSize: 5, // Default for new field
      maxAggregatesSize: 10, // Default for new field
      isSuccessBasedRoutingEnabled: true, // Default to true
      ruleConditionField: undefined,
      ruleConditionOperator: undefined,
      ruleConditionValue: undefined,
      ruleActionProcessorId: undefined,
      // Global Test Payment Data Defaults are removed
      connectorWiseFailurePercentage: dynamicDefaults.connectorWiseFailurePercentage,
      connectorWiseTestCards: dynamicDefaults.connectorWiseTestCardsInit, // Initialize here
      explorationPercent: 20, // Default value for explorationPercent
      selectedRoutingParams: {
        PaymentMethod: true,
        PaymentMethodType: true,
        AuthenticationType: true,
        Currency: true,
        Country: true,
        CardNetwork: true,
        CardBin: true,
      },
      numberOfBatches: 100, // Default value for numberOfBatches
      batchSize: 10, // Default value for batchSize
      ...initialValues, // Props override static defaults
      // Removed ...loadInitialCardDetails() as global fields are not in form schema
    },
  });
  
  // const isSuccessBasedRoutingEnabledWatched = form.watch("isSuccessBasedRoutingEnabled"); // No longer needed for effect
  // const previousIsSuccessBasedRoutingEnabledRef = useRef<boolean | undefined>(); // No longer needed

  // useEffect(() => { // This effect is removed
  //   previousIsSuccessBasedRoutingEnabledRef.current = form.getValues("isSuccessBasedRoutingEnabled");
  // }, [form]);

  // Removed useEffect for fetchActiveRouting

  const handleSuccessBasedRoutingToggle = (enable: boolean) => {
    // Directly update form state and show toast, no API calls.
    form.setValue('isSuccessBasedRoutingEnabled', enable, { shouldDirty: true, shouldValidate: true });

    if (enable) {
      // The API calls for toggle and volume split are removed.
      // We can still set successBasedAlgorithmId to a placeholder or null if it's used elsewhere,
      // or remove its state management if it's no longer needed.
      // For now, let's assume it's not critical if the API isn't called.
      setSuccessBasedAlgorithmId(null); // Or some other indicator if needed
      toast({
        title: "Success Based Routing Enabled",
        description: "Configure parameters for success-based routing.",
      });
      // The volume split concept might be implicitly 100% to this strategy now,
      // or it's handled by the backend when this strategy is chosen by the payment request.
      // toast({ title: "Volume Split Info", description: "Volume split is now 100% to dynamic routing when active." });
    } else {
      setSuccessBasedAlgorithmId(null);
      toast({
        title: "Success Based Routing Disabled",
        description: "Routing will fallback to other configurations or defaults.",
      });
    }
  };

  const [selectedIncidentProcessor, setSelectedIncidentProcessor] = useState<string>('');
  const [incidentDuration, setIncidentDuration] = useState<number>(10);

  useEffect(() => {
    if (merchantConnectors && merchantConnectors.length > 0) {
        const currentFormValues = form.getValues();
        form.reset({
            ...currentFormValues, 
            ...initialValues, 
            processorMatrix: dynamicDefaults.matrix, 
            processorIncidents: dynamicDefaults.incidents,
            processorWiseSuccessRates: dynamicDefaults.rates,
            connectorWiseFailurePercentage: {
              ...dynamicDefaults.connectorWiseFailurePercentage, // Base defaults
              ...(initialValues?.connectorWiseFailurePercentage || {}), // Initial values from parent (if any)
              ...currentFormValues.connectorWiseFailurePercentage, // User's current changes (highest priority)
            },
            connectorWiseTestCards: dynamicDefaults.connectorWiseTestCardsInit, // Add to reset
        });

        const firstConnectorId = merchantConnectors[0].merchant_connector_id || merchantConnectors[0].connector_name;
        if (firstConnectorId && (!selectedIncidentProcessor || !merchantConnectors.some(c => (c.merchant_connector_id || c.connector_name) === selectedIncidentProcessor))) {
            setSelectedIncidentProcessor(firstConnectorId);
        }
    } else {
        const currentFormValues = form.getValues();
        form.reset({
            ...currentFormValues,
            ...initialValues,
            processorMatrix: {},
            processorIncidents: {},
            processorWiseSuccessRates: {},
            connectorWiseFailurePercentage: {},
            connectorWiseTestCards: {}, // Add to reset
            ruleActionProcessorId: undefined,
        });
        setSelectedIncidentProcessor('');
    }
}, [merchantConnectors, dynamicDefaults, form, initialValues, selectedIncidentProcessor]);


  useEffect(() => {
    const subscription = form.watch((values) => {
      const parsedValues = formSchema.safeParse(values);
      if (parsedValues.success) {
        const formData = parsedValues.data;
        let rule: StructuredRule | null = null;
        if (formData.ruleConditionField && formData.ruleConditionOperator && formData.ruleConditionValue && formData.ruleActionProcessorId) {
          rule = {
            id: 'rule1',
            condition: { field: formData.ruleConditionField, operator: formData.ruleConditionOperator, value: formData.ruleConditionValue },
            action: { type: 'ROUTE_TO_PROCESSOR', processorId: formData.ruleActionProcessorId },
          };
        }
        const { overallSuccessRate, ...outputValues } = formData as any; 
        onFormChange({ ...outputValues, structuredRule: rule } as FormValues);

        // Save card details to localStorage
        // Saving global card details to localStorage is removed as fields are removed
      }
    });

    const initialFormValues = form.getValues();
    const initialParsed = formSchema.safeParse(initialFormValues);
    if (initialParsed.success) {
        const initialFormData = initialParsed.data;
        let initialRule: StructuredRule | null = null;
        if (initialFormData.ruleConditionField && initialFormData.ruleConditionOperator && initialFormData.ruleConditionValue && initialFormData.ruleActionProcessorId) {
            initialRule = {
                id: 'rule1',
                condition: { field: initialFormData.ruleConditionField, operator: initialFormData.ruleConditionOperator, value: initialFormData.ruleConditionValue },
                action: { type: 'ROUTE_TO_PROCESSOR', processorId: initialFormData.ruleActionProcessorId }
            };
        }
        const { overallSuccessRate, ...outputValues } = initialFormData as any;
        onFormChange({ ...outputValues, structuredRule: initialRule } as FormValues);
    } else {
        const { overallSuccessRate, ...outputValues } = initialFormValues as any;
        onFormChange({ ...outputValues, structuredRule: null } as FormValues);
    }

    return () => subscription.unsubscribe();
  }, [form, onFormChange]);

  const { control, setValue } = form;

  const handleTriggerIncident = () => {
    if (selectedIncidentProcessor && incidentDuration > 0) {
      const endTime = Date.now() + incidentDuration * 1000;
      setValue(`processorIncidents.${selectedIncidentProcessor}`, endTime, { shouldValidate: true, shouldDirty: true });
    }
  };

  const handleClearRule = () => {
    setValue('ruleConditionField', undefined);
    setValue('ruleConditionOperator', undefined);
    setValue('ruleConditionValue', undefined);
    setValue('ruleActionProcessorId', undefined);
  };

  return (
    <div className="flex flex-col h-full">
      <div
        className={`flex flex-col flex-1 h-full bg-card border-r border-border shadow-sm z-20 transition-all duration-200 min-w-[300px] ${collapsed ? 'w-16' : 'w-64'} p-4`}
      >
        <ScrollArea className="flex-1">
          <Form {...form}>
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4 h-full"> {/* Added h-full */}
              {activeTab === 'general' && (
                <ScrollArea className="h-[100%]">
                  <div className="flex flex-col gap-4">
                    {/* Show only Total Payments for least-cost-routing, show all for intelligent-routing */}
                    {parentTab === 'least-cost-routing' ? (
                      <FormField
                        control={control}
                        name="totalPayments"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Total Payments</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <>
                        <FormField
                          control={control}
                          name="totalPayments"
                          render={({ field }) => {
                            const numberOfBatches = form.watch('numberOfBatches') || 100;
                            const batchSize = form.watch('batchSize') || 10;
                            const calculatedTotal = numberOfBatches * batchSize;
                            // Update the totalPayments value when numberOfBatches or batchSize changes
                            React.useEffect(() => {
                              field.onChange(calculatedTotal);
                            }, [numberOfBatches, batchSize, calculatedTotal, field]);
                            return (
                              <FormItem>
                                <FormLabel>Total Payments (Calculated)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    value={calculatedTotal} 
                                    disabled 
                                    className="bg-muted" 
                                  />
                                </FormControl>
                                <FormDescription className="text-xs">
                                  {numberOfBatches} batches × {batchSize} payments/batch = {calculatedTotal} total
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                        <div className="flex flex-col gap-4">
                          <FormField
                            control={control}
                            name="numberOfBatches"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Number of Batches</FormLabel>
                                <FormControl>
                                  <Input type="number" placeholder="e.g., 100" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={control}
                            name="batchSize"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Batch Size</FormLabel>
                                <FormControl>
                                  <Input type="number" placeholder="e.g., 10" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </>
                    )}
                    {parentTab === 'intelligent-routing' && (
                      <div className="md:col-span-2">
                        <FormLabel>Payment Methods</FormLabel>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <Checkbox checked disabled />
                            <span className="text-muted-foreground">Card (Selected by default)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Currently, "Card" is the only enabled payment method.
                          </p>
                        </div>
                      </div>
                    )}
                    {/* Payment Request Payload Example Section */}
                    <div className="bg-white dark:bg-card rounded-xl shadow-xs border border-gray-200 dark:border-border p-4 mb-4 w-full overflow-x-auto relative">
                      <div className="text-sm font-semibold mb-2 flex items-center justify-between">
                        <span>Payment Request Payload (Example)</span>
                        <button
                          type="button"
                          className="ml-2 p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                          onClick={() => {
                            navigator.clipboard.writeText(`{
"amount": 6540,
"currency": "USD",
"confirm": true,
"profile_id": "YOUR_PROFILE_ID", 
"capture_method": "automatic",
"authentication_type": "no_three_ds",
"customer": {
  "id": "cus_sim_TIMESTAMP_INDEX",
  "name": "John Doe",
  "email": "customer@example.com",
  "phone": "9999999999",
  "phone_country_code": "+1"
},
"payment_method": "card",
"payment_method_type": "credit",
"payment_method_data": {
  "card": {
    "card_number": "SUCCESS_OR_FAILURE_CARD_NUMBER",
    "card_exp_month": "SUCCESS_OR_FAILURE_EXP_MONTH",
    "card_exp_year": "SUCCESS_OR_FAILURE_EXP_YEAR",
    "card_holder_name": "SUCCESS_OR_FAILURE_HOLDER_NAME",
    "card_cvc": "SUCCESS_OR_FAILURE_CVC"
  },
  "billing": {
    "address": {
      "line1": "1467",
      "line2": "Harrison Street",
      "line3": "Harrison Street",
      "city": "San Francisco",
      "state": "California",
      "zip": "94122",
      "country": "US",
      "first_name": "Joseph",
      "last_name": "Doe"
    },
    "phone": {
      "number": "8056594427",
      "country_code": "+91"
    },
    "email": "guest@example.com"
  }
}
// "routing": { ... } // Conditionally added based on SBR
}`);
                            if (typeof window !== 'undefined') {
                              const btn = document.activeElement;
                              if (btn && 'blur' in btn && typeof (btn as HTMLElement).blur === 'function') {
                                (btn as HTMLElement).blur();
                              }
                            }
                            toast({ title: 'Copied!', description: 'Payload copied to clipboard.', duration: 1500 });
                          }}
                          title="Copy to clipboard"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <div style={{ height: 200, overflowY: 'auto' }}>
                        <pre className="bg-muted dark:bg-muted/40 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all text-gray-800 dark:text-gray-100" style={{ maxWidth: '100%', minHeight: 200 }}>{`
{
  "amount": 6540,
  "currency": "USD",
  "confirm": true,
  "profile_id": "YOUR_PROFILE_ID", 
  "capture_method": "automatic",
  "authentication_type": "no_three_ds",
  "customer": {
    "id": "cus_sim_TIMESTAMP_INDEX",
    "name": "John Doe",
    "email": "customer@example.com",
    "phone": "9999999999",
    "phone_country_code": "+1"
  },
  "payment_method": "card",
  "payment_method_type": "credit",
  "payment_method_data": {
    "card": {
      "card_number": "SUCCESS_OR_FAILURE_CARD_NUMBER",
      "card_exp_month": "SUCCESS_OR_FAILURE_EXP_MONTH",
      "card_exp_year": "SUCCESS_OR_FAILURE_EXP_YEAR",
      "card_holder_name": "SUCCESS_OR_FAILURE_HOLDER_NAME",
      "card_cvc": "SUCCESS_OR_FAILURE_CVC"
    },
    "billing": {
      "address": {
        "line1": "1467",
        "line2": "Harrison Street",
        "line3": "Harrison Street",
        "city": "San Francisco",
        "state": "California",
        "zip": "94122",
        "country": "US",
        "first_name": "Joseph",
        "last_name": "Doe"
      },
      "phone": {
        "number": "8056594427",
        "country_code": "+91"
      },
      "email": "guest@example.com"
    }
  }
  // "routing": { ... } // Conditionally added based on SBR
}`}</pre>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">This is an example of the payload sent to the /payments API. Actual values for profile_id and card details are substituted during simulation. The 'routing' object is added if Success Based Routing is enabled and a connector is selected by the SR API.</div>
                    </div>
                    {/* Payment Methods section removed */}
                    {/* Success Test Card Section (moved to test-payment-data) */}
                    {/* Failure Test Card Section (moved to test-payment-data) */}
                  </div>
                </ScrollArea>
              )}
              {activeTab === 'processors' && (
                <div className="bg-white dark:bg-card rounded-xl p-2 flex flex-col flex-grow"> {/* Added flex flex-col flex-grow */}
                  <CardHeader><CardTitle className="text-base">Processor ↔ PM Matrix</CardTitle></CardHeader>
                  <CardContent className="flex flex-col gap-4 flex-grow overflow-y-auto"> {/* Added flex-grow overflow-y-auto */}
                    <div className="flex flex-col gap-2">
                      {(merchantConnectors || []).map(connector => {
                        const connectorId = connector.merchant_connector_id || connector.connector_name;
                        const connectorDisplayName = connector.connector_label || connector.connector_name;
                        return (
                          <div key={connectorId} className="border p-2 rounded-md flex items-center justify-between">
                            <Label htmlFor={`toggle-pm-${connectorId}`} className="font-medium text-sm truncate" title={connectorDisplayName}>
                              {connectorDisplayName}
                            </Label>
                            <Switch
                              id={`toggle-pm-${connectorId}`}
                              checked={connectorToggleStates[connectorId] ?? false}
                              onCheckedChange={(newState) => onConnectorToggleChange(connectorId, newState)}
                              size="sm"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <FormDescription className="text-xs mt-2">
                      Toggle connectors on/off. This status is reflected in the simulation.
                    </FormDescription>
                  </CardContent>
                </div>
              )}
              {activeTab === 'routing' && (
                <div className="flex flex-col gap-8">
                  <div>
                    <div className="pb-3">
                      <div className="flex items-center">
                        <Settings2 className="mr-2 h-5 w-5 text-primary" />
                        <span className="text-lg font-semibold">Routing Parameters</span>
                      </div>
                      <div className="text-xs text-muted-foreground pt-2">Select and configure intelligent routing strategies. Fields are shown if a strategy is enabled.</div>
                    </div>
                    <div className="bg-white dark:bg-card rounded-xl p-2">
                      <FormField
                        control={control}
                        name="isSuccessBasedRoutingEnabled"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg">
                            <FormLabel className="text-base font-normal">Success Based Routing</FormLabel>
                            <FormControl>
                              <Switch
                                checked={field.value || false}
                                onCheckedChange={(newCheckedState) => {
                                  handleSuccessBasedRoutingToggle(newCheckedState);
                                }}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    {form.watch("isSuccessBasedRoutingEnabled") && (
                      <div className="flex flex-col gap-6 border-t pt-6 mt-6">
                        <FormField
                          control={control}
                          name="explorationPercent"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Exploration Percent: {field.value}%</FormLabel>
                              <FormControl>
                                <Slider
                                  defaultValue={[field.value || 20]}
                                  min={0} max={100} step={1}
                                  onValueChange={(value: number[]) => { field.onChange(value[0]); }}
                                />
                              </FormControl>
                              <FormDescription className="text-xs">Percentage of traffic for exploring new routes.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="bg-white dark:bg-card rounded-xl p-2">
                          <h4 className="text-sm font-medium mb-2">Success Rate Window Parameters</h4>
                          <FormField
                            control={control}
                            name="minAggregatesSize"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Minimum Bucket Count (min_aggregates_size)</FormLabel>
                                <FormControl>
                                  <Input type="number" placeholder="e.g., 5" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} min="0" className="bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-gray-900 dark:text-white rounded-md px-3 py-2" />
                                </FormControl>
                                <FormDescription className="text-xs">Min. aggregate data points for SR calculation (for /fetch).</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={control}
                            name="maxAggregatesSize"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Payment Count for Each Bucket (max_aggregates_size)</FormLabel>
                                <FormControl>
                                  <Input type="number" placeholder="e.g., 10" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} min="0" className="bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-gray-900 dark:text-white rounded-md px-3 py-2" />
                                </FormControl>
                                <FormDescription className="text-xs">Max. aggregate data points in a window (for /update).</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                                control={control}
                                name="currentBlockThresholdMaxTotalCount"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">Current Block Threshold (max_total_count)</FormLabel>
                                    <FormControl>
                                      <Input type="number" placeholder="e.g., 5" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} min="0"/>
                                    </FormControl>
                                    <FormDescription className="text-xs">Max total count for current block threshold.</FormDescription>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                        </div>
                      </div>
                    )}
                  </div>
                <div className="bg-white dark:bg-card rounded-xl p-2">
                  <div className="mb-2">
                    <span className="text-base font-medium">Routing Parameters</span>
                  </div>
                  <div className="text-xs text-muted-foreground mb-4">Select parameters to consider for routing decisions.</div>
                    <div className="flex flex-col gap-3 pt-2">
                      {(['PaymentMethod', 'PaymentMethodType', 'AuthenticationType', 'Currency', 'Country', 'CardNetwork', 'CardBin'] as const).map((param) => (
                        <FormField
                          key={param}
                          control={control}
                          name={`selectedRoutingParams.${param}`}
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  id={`routing-param-${param}`}
                                />
                              </FormControl>
                              <Label htmlFor={`routing-param-${param}`} className="text-base font-normal cursor-pointer">
                                {param.replace(/([A-Z])/g, ' $1').trim()}
                              </Label>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                </div>
              </div>
            )}
            {activeTab === 'test-payment-data' && (
              <div className="flex flex-col gap-6"> {/* Adjusted gap */}
                {/* Separate Section for Failure Percentages */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Connector Failure Percentages</CardTitle>
                    <CardDescription className="text-xs">
                      Set the likelihood of a transaction failing for each connector.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    {(merchantConnectors || []).filter(connector => connector.disabled == false).map((connector) => {
                      const connectorId = connector.connector_name; // Use connector_name as the key
                      // const connectorDisplayName = connector.connector_label || connector.connector_name; // Use connector_name directly
                      // Watch the specific field for its current value to display in the label
                      const watchedFailureRate = form.watch(`connectorWiseFailurePercentage.${connectorId}`) ?? 0;

                      return (
                        <FormField
                          control={control}
                          name={`connectorWiseFailurePercentage.${connectorId}`}
                          key={connectorId}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm">
                                {connector.connector_name} Failure Rate: {watchedFailureRate}%
                              </FormLabel>
                              <FormControl>
                                <Slider
                                  value={[field.value ?? 0]}
                                  min={0} max={100} step={1}
                                  onValueChange={(value: number[]) => field.onChange(value[0])}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      );
                    })}
                    {(!merchantConnectors || merchantConnectors.length === 0) && (
                      <p className="text-xs text-muted-foreground">No connectors loaded to configure failure percentages.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Accordion for Test Card Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Connector-Specific Test Cards</CardTitle>
                    <CardDescription className="text-xs">
                      Configure test card details for each connector.
                      These will override global test card details if specified.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="multiple" className="w-full">
                      {(merchantConnectors || []).map((connector) => {
                        const connectorId = connector.connector_name; // Use connector_name as the key
                        // const connectorDisplayName = connector.connector_label || connector.connector_name; // Use connector_name directly

                        return (
                          <AccordionItem value={connectorId} key={connectorId}>
                            <AccordionTrigger>
                              <span className="font-medium">{connector.connector_name}</span>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-6 p-1">
                                {/* Success Card Details for this Connector */}
                                <div className="space-y-3 border p-3 rounded-md bg-muted/20">
                                  <h4 className="text-sm font-semibold text-green-600">Success Card</h4>
                                  <FormField
                                    control={control}
                                    name={`connectorWiseTestCards.${connectorId}.successCard.holderName`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs">Name on card</FormLabel>
                                        <FormControl><Input placeholder="Default: Joseph Doe" {...field} className="bg-background text-xs h-8" /></FormControl>
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={control}
                                    name={`connectorWiseTestCards.${connectorId}.successCard.cardNumber`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs">Card number</FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="Default: 4242..."
                                            maxLength={19}
                                            value={formatCardNumber(field.value || '')}
                                            onChange={e => field.onChange(formatCardNumber(e.target.value))}
                                            className="bg-background text-xs h-8"
                                          />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                  <div className="grid grid-cols-2 gap-3">
                                    <FormField
                                      control={control}
                                      name={`connectorWiseTestCards.${connectorId}.successCard.expMonth`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs">MM</FormLabel>
                                          <FormControl><Input placeholder="10" maxLength={2} {...field} className="bg-background text-xs h-8" /></FormControl>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={control}
                                      name={`connectorWiseTestCards.${connectorId}.successCard.expYear`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs">YY</FormLabel>
                                          <FormControl><Input placeholder="25" maxLength={2} {...field} className="bg-background text-xs h-8" /></FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                  <FormField
                                    control={control}
                                    name={`connectorWiseTestCards.${connectorId}.successCard.cvc`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs">CVC</FormLabel>
                                        <FormControl><Input placeholder="123" maxLength={4} {...field} className="bg-background text-xs h-8 w-20" /></FormControl>
                                      </FormItem>
                                    )}
                                  />
                                </div>

                                {/* Failure Card Details for this Connector */}
                                <div className="space-y-3 border p-3 rounded-md bg-muted/20">
                                  <h4 className="text-sm font-semibold text-red-600">Failure Card</h4>
                                  <FormField
                                    control={control}
                                    name={`connectorWiseTestCards.${connectorId}.failureCard.holderName`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs">Name on card</FormLabel>
                                        <FormControl><Input placeholder="Default: Jane Roe" {...field} className="bg-background text-xs h-8" /></FormControl>
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={control}
                                    name={`connectorWiseTestCards.${connectorId}.failureCard.cardNumber`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs">Card number</FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="Default: 4000..."
                                            maxLength={19}
                                            value={formatCardNumber(field.value || '')}
                                            onChange={e => field.onChange(formatCardNumber(e.target.value))}
                                            className="bg-background text-xs h-8"
                                          />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                  <div className="grid grid-cols-2 gap-3">
                                    <FormField
                                      control={control}
                                      name={`connectorWiseTestCards.${connectorId}.failureCard.expMonth`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs">MM</FormLabel>
                                          <FormControl><Input placeholder="12" maxLength={2} {...field} className="bg-background text-xs h-8" /></FormControl>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={control}
                                      name={`connectorWiseTestCards.${connectorId}.failureCard.expYear`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs">YY</FormLabel>
                                          <FormControl><Input placeholder="26" maxLength={2} {...field} className="bg-background text-xs h-8" /></FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                  <FormField
                                    control={control}
                                    name={`connectorWiseTestCards.${connectorId}.failureCard.cvc`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs">CVC</FormLabel>
                                        <FormControl><Input placeholder="999" maxLength={4} {...field} className="bg-background text-xs h-8 w-20" /></FormControl>
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </CardContent>
                </Card>
                {/* Global Test Card Sections Removed */}
              </div>
            )}
          </form>
        </Form>
      </ScrollArea>
    </div>
    </div>
  );
}
