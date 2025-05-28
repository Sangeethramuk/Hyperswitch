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
import { Settings2, TrendingUp, Zap, VenetianMaskIcon, AlertTriangle, Trash2 } from 'lucide-react';
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
  connectorWiseFailurePercentage: z.map(z.string(), z.number().min(0).max(100)).optional(), // Connector-wise failure percentage
  failurePercentage: z.number().min(0).max(100).optional(),
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
});

export type FormValues = Omit<z.infer<typeof formSchema>, 'structuredRule' | 'overallSuccessRate'> & {
  structuredRule: StructuredRule | null;
  overallSuccessRate?: number;
  isSuccessBasedRoutingEnabled?: boolean; // Corrected to match form schema
  explorationPercent?: number; // Ensure it's part of FormValues if not automatically inferred
  minAggregatesSize?: number; // Ensure it's part of FormValues
  maxAggregatesSize?: number; // Ensure it's part of FormValues
};

interface BottomControlsPanelProps {
  onFormChange: (data: FormValues) => void;
  initialValues?: Partial<FormValues>;
  merchantConnectors: MerchantConnector[];
  currentValues: FormValues | null;
  connectorToggleStates: Record<string, boolean>;
  onConnectorToggleChange: (connectorId: string, newState: boolean) => void;
  onFailurePercentageChange?: (connectorId: string, percentage: number) => void;
  apiKey: string;
  profileId: string;
  merchantId: string;
}

const BOTTOM_PANEL_HEIGHT = "350px";

export function BottomControlsPanel({
  onFormChange,
  initialValues,
  currentValues,
  merchantConnectors,
  connectorToggleStates,
  onConnectorToggleChange,
  onFailurePercentageChange = () => { },
  apiKey,
  profileId,
  merchantId,
}: BottomControlsPanelProps) {
  const { toast } = useToast();
  const [successBasedAlgorithmId, setSuccessBasedAlgorithmId] = useState<string | null>(null);
  // const [activeRoutingAlgorithm, setActiveRoutingAlgorithm] = useState<any | null>(null); // Removed
  // const [isLoadingActiveRouting, setIsLoadingActiveRouting] = useState<boolean>(false); // Removed

  const dynamicDefaults = useMemo(() => {
    const matrix: ProcessorPaymentMethodMatrix = {};
    const incidents: ProcessorIncidentStatus = {};
    const rates: ControlsState['processorWiseSuccessRates'] = {};

    (merchantConnectors || []).forEach(connector => {
      const key = connector.merchant_connector_id || connector.connector_name;
      matrix[key] = PAYMENT_METHODS.reduce((acc, method) => {
        acc[method] = false;
        return acc;
      }, {} as Record<PaymentMethod, boolean>);
      incidents[key] = null;
      rates[key] = { sr: 0, srDeviation: 5, volumeShare: 0, successfulPaymentCount: 0, totalPaymentCount: 0 };
    });
    return { matrix, incidents, rates };
  }, [merchantConnectors]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      totalPayments: 100,
      selectedPaymentMethods: [...PAYMENT_METHODS],
      processorMatrix: dynamicDefaults.matrix,
      processorIncidents: dynamicDefaults.incidents,
      processorWiseSuccessRates: dynamicDefaults.rates,
      currentBlockThresholdDurationInMins: 5, // Default for old field
      currentBlockThresholdMaxTotalCount: 5, // Default for old field
      minAggregatesSize: 5, // Default for new field
      maxAggregatesSize: 10, // Default for new field
      isSuccessBasedRoutingEnabled: false,
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
      failurePercentage: 50,
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
    <div
      className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-20"
      style={{ height: BOTTOM_PANEL_HEIGHT }}
    >
      <ScrollArea className="h-full">
        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()} className="p-4 space-y-2">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-2">
                <TabsTrigger value="general" className="text-xs md:text-sm"><Settings2 className="mr-1 h-4 w-4 md:mr-2" />General</TabsTrigger>
                <TabsTrigger value="processors" className="text-xs md:text-sm"><VenetianMaskIcon className="mr-1 h-4 w-4 md:mr-2" />Processors</TabsTrigger>
                <TabsTrigger value="routing" className="text-xs md:text-sm"><Zap className="mr-1 h-4 w-4 md:mr-2" />Routing</TabsTrigger>
                <TabsTrigger value="sr-incidents" className="text-xs md:text-sm"><TrendingUp className="mr-1 h-4 w-4 md:mr-2" />Test Payment Data</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6"> {/* Increased gap */}
                  {/* Left half for existing controls */}
                  <div className="space-y-4">
                    <FormField
                      control={control}
                      name="totalPayments"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Payments</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="e.g., 1000" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                  </div>

                  {/* Right half for Payment Request Payload */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Payment Request Payload (Example)</Label>
                    <ScrollArea className="h-[200px] w-full rounded-md border p-3 bg-muted/30">
                      <pre className="text-xs whitespace-pre-wrap break-all">
                        {`
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
}
                        `.trim()}
                      </pre>
                    </ScrollArea>
                    <FormDescription className="text-xs">
                      This is an example of the payload sent to the /payments API.
                      Actual values for profile_id and card details are substituted during simulation.
                      The 'routing' object is added if Success Based Routing is enabled and a connector is selected by the SR API.
                    </FormDescription>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="processors" className="pt-2">
                <Card>
                  <CardHeader><CardTitle className="text-base">Processor ↔ PM Matrix</CardTitle></CardHeader>
                  <CardContent className="space-y-1 p-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
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
                </Card>
              </TabsContent>

              <TabsContent value="routing" className="pt-2 space-y-4">
                {/* Removed Card for Currently Active Routing Algorithm */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center">
                      <Settings2 className="mr-2 h-5 w-5 text-primary" />
                      <CardTitle className="text-base">Intelligent Routing Parameters</CardTitle>
                    </div>
                    <CardDescription className="text-xs pt-1">Select and configure intelligent routing strategies. Fields are shown if a strategy is enabled.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3 mb-4 p-3 border rounded-md">
                      <FormField
                        control={control}
                        name="isSuccessBasedRoutingEnabled"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg p-2 hover:bg-muted/50">
                            <FormLabel className="text-sm font-normal">Success Based Routing</FormLabel>
                            <FormControl>
                              <Switch
                                checked={field.value || false}
                                onCheckedChange={(newCheckedState) => {
                                  // Call the new handler instead of field.onChange directly
                                  handleSuccessBasedRoutingToggle(newCheckedState);
                                }}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    {(form.watch("isSuccessBasedRoutingEnabled")) && (
<>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t mt-2">
                        <FormField
                          control={control}
                          name="explorationPercent"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Exploration Percent: {field.value !== undefined ? field.value : 20}%</FormLabel>
                              <FormControl>
                                <Slider
                                  value={field.value !== undefined ? [field.value] : [20]}
                                  min={0} max={100} step={1}
                                  onValueChange={(value: number[]) => { field.onChange(value[0]); }}
                                />
                              </FormControl>
                              <FormDescription className="text-xs">Percentage of traffic for exploring new routes.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {/* Grouping for Current Block Threshold */}
                        <div className="md:col-span-2 space-y-2 p-3 border rounded-md">
                          <h4 className="text-sm font-medium mb-2">Success Rate Window Parameters</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={control}
                              name="minAggregatesSize"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Minimum Bucket Count (min_aggregates_size)</FormLabel>
                                  <FormControl>
                                    <Input type="number" placeholder="e.g., 5" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} min="0" />
                                  </FormControl>
                                  <FormDescription className="text-xs">Min. aggregate data points for SR calculation (for /fetch).</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={control}
                              name="currentBlockThresholdMaxTotalCount"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Payment Count for Each Bucket (max_aggregates_size)</FormLabel>
                                  <FormControl>
                                    <Input type="number" placeholder="e.g., 10" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} min="0"/>
                                  </FormControl>
                                  <FormDescription className="text-xs">Max. aggregate data points in a window (for /update).</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                        {/* End of Grouping */}
                        {/* defaultSuccessRate field removed */}
                        {/* currentBlockThresholdDurationInMins and currentBlockThresholdMaxTotalCount fields are now effectively replaced by minAggregatesSize and maxAggregatesSize for API calls */}
                        </div>
                        <div className="flex justify-end mt-4">
                          {/* Update Config Button Removed as per previous changes */}
                        </div>
                      </>
                    )}
                    <div className="space-y-3 p-3 border rounded-md bg-card mt-4">
                      <FormLabel className="text-sm font-medium">Routing Parameters</FormLabel>
                      <FormDescription className="text-xs">
                        Select parameters to consider for routing decisions.
                      </FormDescription>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 pt-2">
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
                                <Label htmlFor={`routing-param-${param}`} className="text-sm font-normal cursor-pointer">
                                  {param.replace(/([A-Z])/g, ' $1').trim()}
                                </Label>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="sr-incidents" className="pt-2 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Section 1: Success Test Card Details */}
                  <Card className="md:col-span-1">
                    <CardHeader>
                      <CardTitle className="text-base">Success Test Card</CardTitle>
                      <CardDescription className="text-xs">Enter details for a successful transaction.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <FormField
                        control={control}
                        name="successCardNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Card Number</FormLabel>
                            <FormControl><Input placeholder="e.g., 4242..." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <FormField
                          control={control}
                          name="successCardExpMonth"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Exp. Month</FormLabel>
                              <FormControl><Input placeholder="MM" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name="successCardExpYear"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Exp. Year</FormLabel>
                              <FormControl><Input placeholder="YY" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={control}
                        name="successCardHolderName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Card Holder Name</FormLabel>
                            <FormControl><Input placeholder="e.g., Joseph Doe" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name="successCardCvc"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">CVC</FormLabel>
                            <FormControl><Input placeholder="e.g., 123" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {/* Section 2: Failure Test Card Details */}
                  <Card className="md:col-span-1">
                    <CardHeader>
                      <CardTitle className="text-base">Failure Test Card</CardTitle>
                      <CardDescription className="text-xs">Enter details for a failed transaction.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <FormField
                        control={control}
                        name="failureCardNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Card Number</FormLabel>
                            <FormControl><Input placeholder="e.g., 4000..." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <FormField
                          control={control}
                          name="failureCardExpMonth"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Exp. Month</FormLabel>
                              <FormControl><Input placeholder="MM" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name="failureCardExpYear"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Exp. Year</FormLabel>
                              <FormControl><Input placeholder="YY" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={control}
                        name="failureCardHolderName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Card Holder Name</FormLabel>
                            <FormControl><Input placeholder="e.g., Jane Roe" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name="failureCardCvc"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">CVC</FormLabel>
                            <FormControl><Input placeholder="e.g., 999" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {/* Section 3: Failure Percentage Slider */}
                  <Card className="md:col-span-1">
                    <CardHeader>
                      <CardTitle className="text-base">Failure Percentage</CardTitle>
                      <CardDescription className="text-xs">Set the likelihood of a transaction failing.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {
                        Array.from(currentValues?.connectorWiseFailurePercentage?.entries() || []).map(([connector, failureRate]) => (
                          <FormField
                            key={connector}
                            control={control}
                            name={`failurePercentage`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">{connector} Failure Rate: {failureRate}%</FormLabel>
                                <FormControl>
                                  <Slider
                                    defaultValue={[failureRate || 50]}
                                    min={0} max={100} step={1}
                                    onValueChange={(value: number[]) => { field.onChange(value[0]); onFailurePercentageChange(connector, value[0]); }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                        ))}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </form>
        </Form>
      </ScrollArea>
    </div>
  );
}
