
import type { PaymentMethod as PM } from './constants'; // Removed Processor import
import { z } from 'zod';

export type PaymentMethod = PM;
// export type Processor = P; // Processor type removed, use MerchantConnector or string IDs

export interface ProcessorPaymentMethodMatrix {
  [processorId: string]: {
    [method in PaymentMethod]?: boolean;
  };
}

export interface ProcessorIncidentStatus {
  [processorId:string]: number | null;
}

export type ConditionField = 'paymentMethod';
export type ConditionOperator = 'EQUALS';

export interface Condition {
  field: ConditionField;
  operator: ConditionOperator;
  value: PaymentMethod;
}

export interface StructuredRule {
  id: string;
  condition: Condition;
  action: {
    type: 'ROUTE_TO_PROCESSOR';
    processorId: string;
  };
}

// For ControlsState and FormValues in BottomControlsPanel
export interface ControlsState {
  totalPayments: number;
  // tps: number; // TPS Removed
  selectedPaymentMethods: PaymentMethod[]; // Re-added to reflect "Card" as selected
  processorMatrix: ProcessorPaymentMethodMatrix;
  structuredRule: StructuredRule | null;
  processorIncidents: ProcessorIncidentStatus;
  overallSuccessRate: number;
  processorWiseSuccessRates: Record<string, {
    sr: number; // Base input SR from UI
    srDeviation: number;
    volumeShare: number; // Calculated for distribution
    successfulPaymentCount: number; // Actual count
    totalPaymentCount: number;      // Actual count
  }>;
  // New Intelligent Routing Parameters
  minAggregatesSize: number;
  maxAggregatesSize: number;
  currentBlockThresholdMaxTotalCount: number;
  volumeSplit: number;
  isSuccessBasedRoutingEnabled?: boolean; // Renamed for consistency
  // Batch processing parameters
  numberOfBatches?: number;
  batchSize?: number;
}


export interface ProcessorSuccessRate {
  processor: string;
  sr: number; // Observed SR
  successfulPaymentCount: number;
  totalPaymentCount: number;
}

// Types for Time Series Charts (Per Processor)
export interface TimeSeriesDataPoint {
  time: number;
  [processorId: string]: number | string;
}
export type ProcessorMetricsHistory = TimeSeriesDataPoint[];


// Types for Time Series Chart (Overall Success Rate)
export interface OverallSRHistoryDataPoint {
  time: number;
  overallSR: number;
}
export type OverallSRHistory = OverallSRHistoryDataPoint[];

// Zod Schema for TransactionLogEntry
export const TransactionLogEntrySchema = z.object({
  transactionNumber: z.number().describe('Sequential number of the transaction in the simulation.'),
  status: z.string().describe('Status of the payment (e.g., succeeded, failed, pending).'),
  connector: z.string().describe('The payment connector/processor used for this transaction.'),
  timestamp: z.number().describe('Timestamp of when the transaction was logged (epoch milliseconds).'),
});

// Zod Schemas for AI Simulation Summary Flow
export const AISummaryProcessorMetricSchema = z.object({
  name: z.string().describe('Name of the payment processor.'),
  volume: z.number().describe('Total transactions routed to this processor.'),
  observedSr: z.number().describe('Observed success rate for this processor during the simulation (%).'),
  baseSr: z.number().describe('Configured base success rate for this processor before incidents and deviations (%).'),
});
export type AISummaryProcessorMetric = z.infer<typeof AISummaryProcessorMetricSchema>;

export const AISummaryIncidentSchema = z.object({
  processorName: z.string().describe('Name of the processor.'),
  isActive: z.boolean().describe('Whether an incident was considered active for this processor at the time of summary.'),
});
export type AISummaryIncident = z.infer<typeof AISummaryIncidentSchema>;

export const SummarizeSimulationInputSchema = z.object({
  totalPaymentsProcessed: z.number().describe('Total number of payments processed in the simulation.'),
  targetTotalPayments: z.number().describe('The target total number of payments for the simulation.'),
  overallSuccessRate: z.number().describe('The final overall success rate of the simulation (%).'),
  totalSuccessful: z.number().describe('Total number of successful transactions.'),
  totalFailed: z.number().describe('Total number of failed transactions.'),
  effectiveTps: z.number().describe('The effective transactions per second during the simulation.'),
  processorMetrics: z.array(AISummaryProcessorMetricSchema).describe('Metrics for each payment processor.'),
  incidents: z.array(AISummaryIncidentSchema).describe('Information about any active incidents for processors.'),
  simulationDurationSteps: z.number().describe('Total number of time steps the simulation ran for.'),
  transactionLogs: z.array(TransactionLogEntrySchema).describe('Detailed log of each transaction attempt, including status and connector used.'),
});
export type AISummaryInput = z.infer<typeof SummarizeSimulationInputSchema>;

export const SummarizeSimulationOutputSchema = z.object({
  summaryText: z.string().describe('A concise, human-readable summary of the simulation run, highlighting key outcomes and notable events like incidents or significant performance of certain processors.'),
});
export type AISummaryOutput = z.infer<typeof SummarizeSimulationOutputSchema>;

// Interface for Merchant Connector data fetched from API
export interface MerchantConnector {
  connector_name: string; // Typically used as an identifier if no specific ID field is primary
  connector_label: string; // User-friendly display name
  merchant_connector_id: string; // Often the most stable unique identifier for the merchant's specific connector instance
  disabled?: boolean; // Explicitly add the disabled field
  connector_type?: string; // Using string for flexibility, can be a union of known types
  // status?: 'active' | 'inactive'; // 'disabled' field might replace or complement a 'status' field
  // payment_methods_enabled?: Array<Record<string, any>>; // If API provides this detail
  [key: string]: any; // Allow other dynamic properties
}

// For logging payment attempts during simulation
export interface TransactionLogEntry {
  transactionNumber: number;
  status: string; // e.g., "succeeded", "failed", "pending"
  connector: string; // The connector used for the transaction
  timestamp: number; // epoch milliseconds, to help with sequencing and time-based analysis
  routingApproach?: 'exploration' | 'exploitation' | 'unknown' | 'N/A'; // Added routing approach
  sr_scores?: Record<string, number>; // Added sr_scores
  // Add LCR-specific fields
  lcrData?: {
    isEligible: boolean;
    coBadgedNetworks: string[];
    savingsPercentage: number;
    selectedNetwork: string;
    isDebitRouted: boolean;
    cardType: 'credit' | 'not-co-badged' | 'regulated' | 'unregulated' | 'global-cheaper';
    cardLabel: string;
  };
}

// LCR-specific types
export interface LCRTestCard {
  number: string;
  label: string;
  amount_range: [number, number];
  exp_month?: string;
  payment_type: 'credit' | 'debit';
}

export interface DebitRoutingResult {
  isEligible: boolean;
  coBadgedNetworks: string[];
  selectedNetwork: string;
  savingsPercentage: number;
  isDebitRouted: boolean;
}
