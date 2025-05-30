"use client"

import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart as PieChartIcon } from 'lucide-react'; // Renamed to avoid conflict
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useEffect, useRef } from 'react';

interface TransactionDistributionChartProps {
  data: Array<{ name: string; value: number; fill?: string }>; // Made fill optional
}

// Predefined direct HSL color strings for the pie chart
// These correspond to --chart-1 to --chart-5 from globals.css's dark theme
const PIE_CHART_COLORS = [
  'hsl(44, 96%, 51%)',
  'hsl(218, 57%, 54%)',
  'hsl(354, 70%, 50%)',
  'hsl(112, 16%, 52%)',
  'hsl(274, 74%, 66%)',
];

export function TransactionDistributionChart({ data }: TransactionDistributionChartProps) {
  const previousDataRef = useRef<Array<{ name: string; value: number; fill?: string }>>([]);

  useEffect(() => {
    if (data && data.length > 0 && data.some(item => item.value > 0)) {
      previousDataRef.current = data;
    }
  }, [data]);

  const currentData = (data && data.length > 0 && data.some(item => item.value > 0)) ? data : previousDataRef.current;
  const hasData = currentData && currentData.length > 0 && currentData.some(item => item.value > 0);

  return (
    <Card>
      <CardHeader className="pt-6 pl-6 pr-6">
        <CardTitle className="flex items-center"><PieChartIcon className="mr-2 h-6 w-6 text-primary" /> Transaction Distribution</CardTitle>
        <CardDescription>Processor-wise distribution of transactions.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[300px]">
        {hasData ? (
           <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Legend 
                wrapperStyle={{ color: 'hsl(var(--foreground))', fontSize: '12px', paddingTop: '10px' }}
                formatter={(value, entry) => (
                  <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>
                )}
              />
              <Pie
                data={currentData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                labelLine={false}
                label={({ name, percent }) => {
                  if (typeof percent !== 'number' || isNaN(percent)) return null;
                  const percentage = (percent * 100).toFixed(0);
                  if (parseFloat(percentage) < 5) return null; // Hide label if too small
                  return `${name}: ${percentage}%`;
                }}
                fontSize={12}
                stroke="hsl(var(--background))" // Use direct background for stroke between cells
                strokeWidth={2}
              >
                {currentData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]} // Use direct colors
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-10">
             <Image
                src="https://placehold.co/300x150.png?text=No+Distribution+Data"
                alt="Distribution Chart Placeholder"
                width={300}
                height={150}
                className="rounded-md shadow-sm opacity-50"
                data-ai-hint="pie chart"
            />
            <p className="mt-2 text-sm text-muted-foreground">Chart data will appear here after simulation.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
