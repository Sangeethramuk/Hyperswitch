
"use client";

import { useMemo } from 'react';
import { OverallSuccessRateDisplay } from './analytics/OverallSuccessRateDisplay';
import { ProcessorSuccessRatesTable } from './analytics/ProcessorSuccessRatesTable';
import { TransactionDistributionChart } from './analytics/TransactionDistributionChart';
import type { FormValues } from '@/components/BottomControlsPanel';
// import { PROCESSORS } from '@/lib/constants'; // PROCESSORS import removed
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListChecks, CheckCircle2, XCircle, Gauge } from 'lucide-react';
import type { OverallSRHistory, MerchantConnector } from '@/lib/types'; // Added MerchantConnector


interface StatsViewProps {
  currentControls: FormValues | null;
  merchantConnectors: MerchantConnector[]; // Added merchantConnectors prop
  processedPayments?: number;
  totalSuccessful?: number;
  totalFailed?: number;
  overallSuccessRateHistory: OverallSRHistory;
}

const CHART_COLORS_HSL = {
  '--chart-1': 'hsl(var(--chart-1))',
  '--chart-2': 'hsl(var(--chart-2))',
  '--chart-3': 'hsl(var(--chart-3))',
  '--chart-4': 'hsl(var(--chart-4))',
  '--chart-5': 'hsl(var(--chart-5))',
};

const chartColorKeys = Object.keys(CHART_COLORS_HSL) as (keyof typeof CHART_COLORS_HSL)[];

export function StatsView({
  currentControls,
  merchantConnectors, // Destructure merchantConnectors from props
  processedPayments = 0,
  totalSuccessful = 0,
  totalFailed = 0,
  overallSuccessRateHistory,
}: StatsViewProps) {
  const overallSR = currentControls?.overallSuccessRate ?? 0;
  // const effectiveTps = currentControls?.tps ?? 0; // TPS Removed

  const processorSRData = useMemo(() => {
    if (!currentControls?.processorWiseSuccessRates) {
      return [];
    }

    // If processorWiseSuccessRates exists, but processedPayments is 0,
    // map processors to show 0 SR and 0 counts.
    if (processedPayments === 0) {
      return Object.keys(currentControls.processorWiseSuccessRates)
        .map(processorId => {
          const stats = currentControls.processorWiseSuccessRates![processorId];
          const connectorInfo = merchantConnectors.find(mc => (mc.merchant_connector_id || mc.connector_name) === processorId);
          const processorName = connectorInfo ? (connectorInfo.connector_label || connectorInfo.connector_name) : processorId;
          return {
            processor: processorName,
            sr: 0, // Default SR to 0 if no payments processed
            successfulPaymentCount: 0,
            totalPaymentCount: 0,
            volumeShareForSort: stats.volumeShare ?? 0,
          };
        })
        .sort((a, b) => b.volumeShareForSort - a.volumeShareForSort)
        .map(({ volumeShareForSort, ...rest }) => rest);
    }

    // If there are processed payments and processor-wise rates
    return Object.keys(currentControls.processorWiseSuccessRates)
      .map(processorId => {
        const stats = currentControls.processorWiseSuccessRates![processorId];
        const connectorInfo = merchantConnectors.find(mc => (mc.merchant_connector_id || mc.connector_name) === processorId);
        const processorName = connectorInfo ? (connectorInfo.connector_label || connectorInfo.connector_name) : processorId;
        
        // SR is 0 if this processor had no volume, otherwise 100 - failureRate.
        const observedSr = (stats.volumeShare > 0) ? (100 - stats.failureRate) : 0;
        
        const totalPaymentCountForProcessor = Math.round((stats.volumeShare / 100) * processedPayments);
        const successfulPaymentCountForProcessor = Math.round(totalPaymentCountForProcessor * (observedSr / 100));
        
        return {
          processor: processorName,
          sr: observedSr, 
          successfulPaymentCount: successfulPaymentCountForProcessor,
          totalPaymentCount: totalPaymentCountForProcessor,
          volumeShareForSort: stats.volumeShare, // Keep for sorting
        };
      })
      .sort((a, b) => b.volumeShareForSort - a.volumeShareForSort)
      .map(({ volumeShareForSort, ...rest }) => rest); // Remove temporary sort key
  }, [currentControls?.processorWiseSuccessRates, merchantConnectors, processedPayments]);

  const transactionDistributionData = useMemo(() => {
    if (!currentControls?.processorWiseSuccessRates) {
      return [];
    }
    return Object.keys(currentControls.processorWiseSuccessRates)
      .map((processorId) => {
        const stats = currentControls.processorWiseSuccessRates![processorId];
        const connectorInfo = merchantConnectors.find(mc => (mc.merchant_connector_id || mc.connector_name) === processorId);
        const processorName = connectorInfo ? (connectorInfo.connector_label || connectorInfo.connector_name) : processorId;
        return {
          name: processorName,
          value: stats.volumeShare, // Raw volume count for pie chart value
          fill: '', // Kept dummy fill, TransactionDistributionChart makes fill optional
        };
      })
      .filter(item => item.value > 0) 
      .sort((a,b) => b.value - a.value); 
  }, [currentControls?.processorWiseSuccessRates, merchantConnectors]);

  return (
    <div className="space-y-6 flex flex-col">
      {/* Stats Cards in a 2-column grid for wider screens, stack on smaller */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Processed</CardTitle>
            <ListChecks className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{processedPayments.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
                of {currentControls?.totalPayments.toLocaleString() || 'N/A'} target
            </p>
          </CardContent>
        </Card>
        {/* Effective TPS Card Removed */}
        {/* <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Effective TPS</CardTitle>
            <Gauge className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">N/A</div>
            <p className="text-xs text-muted-foreground">transactions per second (Rate limited by interval)</p>
          </CardContent>
        </Card> */}
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Successful</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSuccessful.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {processedPayments > 0 ? `${((totalSuccessful / processedPayments) * 100).toFixed(1)}% of processed` : '0.0%'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Failed</CardTitle>
            <XCircle className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFailed.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {processedPayments > 0 ? `${((totalFailed / processedPayments) * 100).toFixed(1)}% of processed` : '0.0%'}
            </p>
          </CardContent>
        </Card>
      </div>
      
      <OverallSuccessRateDisplay rate={overallSR} history={overallSuccessRateHistory} />
      <TransactionDistributionChart data={transactionDistributionData} />
      <ProcessorSuccessRatesTable data={processorSRData} />
      
      <div className="p-6 bg-muted/30 rounded-lg text-center mt-auto">
        <p className="text-muted-foreground">Summary statistics based on current simulation run.</p>
      </div>
    </div>
  );
}
