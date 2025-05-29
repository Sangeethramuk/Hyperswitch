"use client";

import { MerchantConnectorList } from "./processors/MerchantConnectorList";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { MerchantConnector } from "@/lib/types"; // Import from global types

interface ProcessorsTabViewProps {
  merchantConnectors: MerchantConnector[];
  // connectorToggleStates: Record<string, boolean>; // Removed
  // onConnectorToggleChange: (connectorId: string, newState: boolean) => void; // Removed
  isLoadingConnectors?: boolean; // Optional: to show a loading state
}

export function ProcessorsTabView({
  merchantConnectors,
  // connectorToggleStates, // Removed
  // onConnectorToggleChange, // Removed
  isLoadingConnectors = false,
}: ProcessorsTabViewProps) {
  // console.log("ProcessorsTabView rendering. isLoadingConnectors:", isLoadingConnectors, "Number of merchantConnectors:", merchantConnectors?.length, "connectorToggleStates:", connectorToggleStates); // Modified log
  // console.log("ProcessorsTabView rendering. isLoadingConnectors:", isLoadingConnectors, "Number of merchantConnectors:", merchantConnectors?.length);
  return (
    <ScrollArea className="h-full">
      <div className="p-2 md:p-4 lg:p-6">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Merchant Connector Configuration</CardTitle>
            <CardDescription>
              View and manage connectors configured for your merchant account. 
              Toggles are currently for display purposes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingConnectors ? (
              <div className="flex items-center justify-center h-[200px]">
                <p className="text-muted-foreground">Loading merchant connectors...</p>
              </div>
            ) : (
              <MerchantConnectorList
                connectors={merchantConnectors}
                // toggleStates={connectorToggleStates} // Removed
                // onToggleChange={onConnectorToggleChange} // Removed
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
