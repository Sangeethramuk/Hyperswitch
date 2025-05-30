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
import { PAYMENT_METHODS } from '@/lib/constants'; 
import type { ControlsState, PaymentMethod, ProcessorPaymentMethodMatrix, ProcessorIncidentStatus, StructuredRule, ConditionField, ConditionOperator, MerchantConnector } from '@/lib/types';
import { Settings2, TrendingUp, Zap, VenetianMaskIcon, AlertTriangle, Trash2, Copy } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

const LOCALSTORAGE_SUCCESS_CARD_KEY = 'hyperswitch_successCardDetails';
const LOCALSTORAGE_FAILURE_CARD_KEY = 'hyperswitch_failureCardDetails';

const loadInitialCardDetails = (): Partial<FormValues> => {
  const loaded: Partial<FormValues> = {};
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
  // Test Payment Data Fields
  successCardNumber: z.string().optional(),
  successCardExpMonth: z.string().optional(),
  successCardExpYear: z.string().optional(),
  successCardHolderName: z.string().optional(),
  successCardCvc: z.string().optional(),
  failureCardNumber: z.string().optional(),
  failureCardExpMonth: z.string().optional(),
  failureCardExpYear: z.string().optional(),
  failureCardHolderName: z.string().optional(),
  failureCardCvc: z.string().optional(),
  connectorWiseFailurePercentage: z.record(z.string(), z.number()), // Connector-wise failure percentage
  explorationPercent: z.number().min(0).max(100).optional(), // Added explorationPercent
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
}: BottomControlsPanelProps & { activeTab: string }) {
  const { toast } = useToast();
  const [successBasedAlgorithmId, setSuccessBasedAlgorithmId] = useState<string | null>(null);
  // const [activeRoutingAlgorithm, setActiveRoutingAlgorithm] = useState<any | null>(null); // Removed
  // const [isLoadingActiveRouting, setIsLoadingActiveRouting] = useState<boolean>(false); // Removed
  const dynamicDefaults = useMemo(() => {
    const matrix: ProcessorPaymentMethodMatrix = {};
    const incidents: ProcessorIncidentStatus = {};
    const rates: ControlsState['processorWiseSuccessRates'] = {};
    const connectorWiseFailurePercentage: Record<string, number> = {};

    (merchantConnectors || []).forEach(connector => {
      const key = connector.merchant_connector_id || connector.connector_name;
      matrix[key] = PAYMENT_METHODS.reduce((acc, method) => {
        acc[method] = false; 
        return acc;
      }, {} as Record<PaymentMethod, boolean>);
      incidents[key] = null;
      rates[key] = { sr: 0, srDeviation: 5, volumeShare: 0, successfulPaymentCount: 0, totalPaymentCount: 0 };
      if(connector.disabled == false) {
        connectorWiseFailurePercentage[connector.connector_name] = 50;
      }
    });
    return { matrix, incidents, rates, connectorWiseFailurePercentage };
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
      // Test Payment Data Defaults
      successCardNumber: "4242424242424242",
      successCardExpMonth: "10",
      successCardExpYear: "25",
      successCardHolderName: "Joseph Doe",
      successCardCvc: "123",
      failureCardNumber: "4000000000000002", // Example failure card
      failureCardExpMonth: "12",
      failureCardExpYear: "26",
      failureCardHolderName: "Jane Roe",
      failureCardCvc: "999",
      connectorWiseFailurePercentage: dynamicDefaults.connectorWiseFailurePercentage,
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
      ...initialValues, // Props override static defaults
      ...loadInitialCardDetails(), // localStorage overrides props and static defaults for the fields it contains
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
      // We can add a toast for that if it's still a relevant user-facing concept.
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
            connectorWiseFailurePercentage: dynamicDefaults.connectorWiseFailurePercentage,
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
        if (typeof window !== 'undefined') {
          try {
            const successCardDetailsToSave = {
              cardNumber: formData.successCardNumber,
              expMonth: formData.successCardExpMonth,
              expYear: formData.successCardExpYear,
              holderName: formData.successCardHolderName,
              cvc: formData.successCardCvc,
            };
            localStorage.setItem(LOCALSTORAGE_SUCCESS_CARD_KEY, JSON.stringify(successCardDetailsToSave));

            const failureCardDetailsToSave = {
              cardNumber: formData.failureCardNumber,
              expMonth: formData.failureCardExpMonth,
              expYear: formData.failureCardExpYear,
              holderName: formData.failureCardHolderName,
              cvc: formData.failureCardCvc,
            };
            localStorage.setItem(LOCALSTORAGE_FAILURE_CARD_KEY, JSON.stringify(failureCardDetailsToSave));
          } catch (e) {
            console.error("Error saving card details to localStorage", e);
          }
        }
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
    <div>
    <div
      className={`h-full bg-card border-r border-border shadow-sm z-20 transition-all duration-200 flex flex-col min-w-[300px] ${collapsed ? 'w-16' : 'w-64'} p-4`}
    >
      <ScrollArea className="flex-1">
        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4 h-full"> {/* Added h-full */}
            {activeTab === 'general' && (
              <ScrollArea className="h-[100%]">
              <div className="flex flex-col gap-4">
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
                <div className="grid grid-cols-2 gap-4">
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
                <div className="md:col-span-2">
                    <FormLabel>Payment Methods</FormLabel>
                    <div className="flex items-center space-x-3 mt-2 p-3 border rounded-md bg-muted/50">
                      <Checkbox id="payment-method-card" checked={true} disabled={true} />
                      <Label htmlFor="payment-method-card" className="font-normal text-muted-foreground">
                        Card (Selected by default)
                      </Label>
                    </div>
                    <FormDescription className="text-xs mt-1">
                      Currently, "Card" is the only enabled payment method.
                    </FormDescription>
                  </div>
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
              <div className="flex flex-col gap-8">
                {/* Section 3: Failure Percentage Slider (move to top) */}
                <div className="bg-white dark:bg-card rounded-xl mb-8">
                    <CardHeader>
                      <CardTitle className="text-base">Failure Percentage</CardTitle>
                      <CardDescription className="text-xs">Set the likelihood of a transaction failing.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        {
                        form.watch('connectorWiseFailurePercentage') && Object.entries(form.watch('connectorWiseFailurePercentage')).map(([connector, failureRate]) => (
                          <FormItem key={connector} className="mb-2">
                            <FormLabel className="text-xs">{connector} Failure Rate: {failureRate}%</FormLabel>
                            <FormControl>
                              <Slider
                                value={[failureRate]}
                                min={0} max={100} step={1}
                                onValueChange={(value: number[]) => {
                                  form.setValue(`connectorWiseFailurePercentage.${connector}`, value[0], { shouldValidate: true, shouldDirty: true });
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        ))}
                    </CardContent>
                </div>
                {/* Success Test Card Section */}
                <div className="bg-white dark:bg-card rounded-xl mb-8">
                  <CardHeader>
                    <CardTitle className="text-base">Success Test Card</CardTitle>
                    <CardDescription className="text-xs mb-3">Enter details for a successful transaction.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-4">
                      <FormField
                        control={control}
                        name="successCardHolderName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Name on card</FormLabel>
                            <FormControl><Input placeholder="e.g., John Wave" {...field} className="bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-gray-900 dark:text-white rounded-md px-3 py-2" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name="successCardNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Card number</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="4242 4242 4242 4242"
                                maxLength={19}
                                value={formatCardNumber(field.value || '')}
                                onChange={e => {
                                  const formatted = formatCardNumber(e.target.value);
                                  field.onChange(formatted);
                                }}
                                className="bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-gray-900 dark:text-white rounded-md px-3 py-2"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-8">
                        <FormField
                          control={control}
                          name="successCardExpMonth"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel className="text-xs">Expiry date</FormLabel>
                              <FormControl>
                                <div className="flex gap-2 items-center">
                                  <Input placeholder="MM" maxLength={2} className="w-14 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-gray-900 dark:text-white rounded-md px-2 py-2" {...field} />
                                  <span className="self-center">/</span>
                                  <FormField
                                    control={control}
                                    name="successCardExpYear"
                                    render={({ field: yearField }) => (
                                      <Input placeholder="YY" maxLength={2} className="w-14 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-gray-900 dark:text-white rounded-md px-2 py-2" {...yearField} />
                                    )}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name="successCardCvc"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel className="text-xs">Security code</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="123" 
                                  maxLength={4} 
                                  {...field} 
                                  className="w-20 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-gray-900 dark:text-white rounded-md px-2 py-2" 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </CardContent>
                </div>
                {/* Failure Test Card Section */}
                <div className="bg-white dark:bg-card rounded-xl">
                  <CardHeader>
                    <CardTitle className="text-base">Failure Test Card</CardTitle>
                    <CardDescription className="text-xs">Enter details for a failed transaction.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-4">
                      <FormField
                        control={control}
                        name="failureCardHolderName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Name on card</FormLabel>
                            <FormControl><Input placeholder="e.g., Jane Roe" {...field} className="bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-gray-900 dark:text-white rounded-md px-3 py-2" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name="failureCardNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Card number</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="4000 0000 0000 0002"
                                maxLength={19}
                                value={formatCardNumber(field.value || '')}
                                onChange={e => {
                                  const formatted = formatCardNumber(e.target.value);
                                  field.onChange(formatted);
                                }}
                                className="bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-gray-900 dark:text-white rounded-md px-3 py-2"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-8">
                        <FormField
                          control={control}
                          name="failureCardExpMonth"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel className="text-xs">Expiry date</FormLabel>
                              <FormControl>
                                <div className="flex gap-2 items-center">
                                  <Input placeholder="MM" maxLength={2} className="w-14 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-gray-900 dark:text-white rounded-md px-2 py-2" {...field} />
                                  <span className="self-center">/</span>
                                  <FormField
                                    control={control}
                                    name="failureCardExpYear"
                                    render={({ field: yearField }) => (
                                      <Input placeholder="YY" maxLength={2} className="w-14 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-gray-900 dark:text-white rounded-md px-2 py-2" {...yearField} />
                                    )}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name="failureCardCvc"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel className="text-xs">Security code</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="999" 
                                  maxLength={4} 
                                  {...field} 
                                  className="w-20 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-gray-900 dark:text-white rounded-md px-2 py-2" 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </CardContent>
                </div>
              </div>
            )}
          </form>
        </Form>
      </ScrollArea>
    </div>
    </div>
  );
}
