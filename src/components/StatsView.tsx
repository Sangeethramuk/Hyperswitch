"use client";

import { useMemo } from 'react';
import { OverallSuccessRateDisplay } from './analytics/OverallSuccessRateDisplay';
import { ProcessorSuccessRatesTable } from './analytics/ProcessorSuccessRatesTable';
import { TransactionDistributionChart } from './analytics/TransactionDistributionChart';
import { SuccessRateOverTimeChart } from './analytics/SuccessRateOverTimeChart';
import { VolumeOverTimeChart } from './analytics/VolumeOverTimeChart';
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
  parentTab?: 'intelligent-routing' | 'least-cost-routing'; // Add parentTab prop
  successRateHistory?: any;
  volumeHistory?: any;
  connectorToggleStates?: any;
  lcrStats?: {
    totalSavingsAmount: number;
    totalAmountProcessed: number;
    eligibleCount: number;
    debitRoutedCount: number;
    cardTypeDistribution: {
      credit: number;
      'not-co-badged': number;
      regulated: number;
      unregulated: number;
      'global-cheaper': number;
    };
  };
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
  parentTab = 'intelligent-routing', // Default to intelligent-routing
  successRateHistory = [],
  volumeHistory = [],
  connectorToggleStates = {},
  lcrStats,
}: StatsViewProps) {
  const overallSR = currentControls?.overallSuccessRate ?? 0;
  // const effectiveTps = currentControls?.tps ?? 0; // TPS Removed

  const processorSRData = useMemo(() => {
    if (!currentControls?.processorWiseSuccessRates) {
      return [];
    }

    // If processorWiseSuccessRates exists, but processedPayments is 0,
    // map processors to show 0 SR and 0 counts.
    // Directly use successfulPaymentCount and totalPaymentCount from currentControls
    return Object.keys(currentControls.processorWiseSuccessRates)
      .map(processorId => {
        const processorData = currentControls.processorWiseSuccessRates![processorId];
        const connectorInfo = merchantConnectors.find(mc => (mc.merchant_connector_id || mc.connector_name) === processorId);
        const processorName = connectorInfo ? connectorInfo.connector_name : processorId;
        
        const successfulPayments = processorData.successfulPaymentCount;
        const totalPayments = processorData.totalPaymentCount;
        const calculatedSr = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

        return {
          processor: processorName,
          sr: calculatedSr, 
          successfulPaymentCount: successfulPayments,
          totalPaymentCount: totalPayments,
          // Use totalPaymentCount for sorting by volume, or volumeShare if still needed for other charts
          volumeForSort: totalPayments, 
        };
      })
      // Sort by total payments for this processor as a proxy for volume
      .sort((a, b) => b.volumeForSort - a.volumeForSort) 
      .map(({ volumeForSort, ...rest }) => rest); // Remove temporary sort key
  }, [currentControls?.processorWiseSuccessRates, merchantConnectors]);

  const transactionDistributionData = useMemo(() => {
    if (!currentControls?.processorWiseSuccessRates) {
      return [];
    }
    return Object.keys(currentControls.processorWiseSuccessRates)
      .map((processorId) => {
        const stats = currentControls.processorWiseSuccessRates![processorId];
        const connectorInfo = merchantConnectors.find(mc => (mc.merchant_connector_id || mc.connector_name) === processorId);
        const processorName = connectorInfo ? connectorInfo.connector_name : processorId;
        return {
          name: processorName,
          value: stats.volumeShare, // Raw volume count for pie chart value
          fill: '', // Kept dummy fill, TransactionDistributionChart makes fill optional
        };
      })
      .filter(item => item.value > 0) 
      .sort((a,b) => b.value - a.value); 
  }, [currentControls?.processorWiseSuccessRates, merchantConnectors]);

  // Card headings based on parentTab
  const headings = parentTab === 'least-cost-routing'
    ? [
        'Total Amount Processed',
        'Total Debit Routed Transactions',
        'Total Savings (%)',
      ]
    : [
        'Total Processed',
        'Total Successful',
        'Total Failed',
      ];

  return (
    <div className="space-y-6 flex flex-col">
      {/* Stats Cards in a 2-column grid for wider screens, stack on smaller */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-6 pl-6 pr-6">
            <CardTitle className="text-sm font-medium">{headings[0]}</CardTitle>
            <ListChecks className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-6">
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
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-6 pl-6 pr-6">
            <CardTitle className="text-sm font-medium">{headings[1]}</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent className="p-6">
            <div className="text-2xl font-bold">{totalSuccessful.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {processedPayments > 0 ? `${((totalSuccessful / processedPayments) * 100).toFixed(1)}% of processed` : '0.0%'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-6 pl-6 pr-6">
            <CardTitle className="text-sm font-medium">{headings[2]}</CardTitle>
            <XCircle className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent className="p-6">
            <div className="text-2xl font-bold">{totalFailed.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {processedPayments > 0 ? `${((totalFailed / processedPayments) * 100).toFixed(1)}% of processed` : '0.0%'}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {parentTab === 'least-cost-routing' && lcrStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Overall Savings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {lcrStats.totalAmountProcessed > 0 
                  ? `${((lcrStats.totalSavingsAmount / lcrStats.totalAmountProcessed) * 100).toFixed(2)}%`
                  : '0%'}
              </div>
              <p className="text-xs text-muted-foreground">
                ${lcrStats.totalSavingsAmount.toFixed(2)} saved
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Eligible Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lcrStats.eligibleCount}</div>
              <p className="text-xs text-muted-foreground">
                {processedPayments > 0 
                  ? `${((lcrStats.eligibleCount / processedPayments) * 100).toFixed(1)}% of total`
                  : '0% of total'}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Debit Routed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lcrStats.debitRoutedCount}</div>
              <p className="text-xs text-muted-foreground">
                {lcrStats.eligibleCount > 0 
                  ? `${((lcrStats.debitRoutedCount / lcrStats.eligibleCount) * 100).toFixed(1)}% of eligible`
                  : '0% of eligible'}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Card Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-xs">
                <div>Credit: {lcrStats.cardTypeDistribution.credit}</div>
                <div>Not Co-badged: {lcrStats.cardTypeDistribution['not-co-badged']}</div>
                <div>Regulated: {lcrStats.cardTypeDistribution.regulated}</div>
                <div>Unregulated: {lcrStats.cardTypeDistribution.unregulated}</div>
                <div>Global Cheaper: {lcrStats.cardTypeDistribution['global-cheaper']}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      <SuccessRateOverTimeChart data={successRateHistory} merchantConnectors={merchantConnectors} connectorToggleStates={connectorToggleStates} />
      <VolumeOverTimeChart data={volumeHistory} merchantConnectors={merchantConnectors} connectorToggleStates={connectorToggleStates} />
      <TransactionDistributionChart data={transactionDistributionData} />
      {/* <ProcessorSuccessRatesTable data={processorSRData} /> */}
    </div>
  );
}
