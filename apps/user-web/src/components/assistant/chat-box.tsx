'use client';

import React, { useState } from 'react';
import { Bike, Car, Filter, RefreshCw, Trash2, Truck, Sparkles } from 'lucide-react';
import type { LegalCitation, VehicleType } from '@traffic-ioc/shared';
import { useRagChat } from '@/hooks/use-rag-chat';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MessageList } from './message-list';
import { PromptInput } from './prompt-input';
import { CitationDrawer } from './citation-drawer';
import { cn } from '@/lib/utils';

export const VEHICLE_FILTERS: Array<{
  label: string;
  value: VehicleType | null;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { label: 'Tất cả', value: null, icon: Filter },
  { label: 'Xe máy', value: 'MOTORBIKE', icon: Bike },
  { label: 'Ô tô', value: 'CAR', icon: Car },
  { label: 'Xe tải', value: 'TRUCK', icon: Truck },
];

export function ChatBox() {
  const {
    messages,
    isLoading,
    isStreaming,
    error,
    vehicleFilter,
    setVehicleFilter,
    sendMessage,
    clearChat,
    stopStreaming,
  } = useRagChat();

  const [selectedCitation, setSelectedCitation] = useState<LegalCitation | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleCitationClick = (citation: LegalCitation) => {
    setSelectedCitation(citation);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedCitation(null);
  };

  return (
    <Card className="flex flex-1 flex-col overflow-hidden border-slate-200 bg-white shadow-sm">
      {/* Top Toolbar: Vehicle Filter Selector & Reset Action */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">
            Phương tiện:
          </span>
          {VEHICLE_FILTERS.map((filter) => {
            const Icon = filter.icon;
            const isActive = vehicleFilter === filter.value;
            return (
              <button
                key={filter.label}
                type="button"
                onClick={() => setVehicleFilter(filter.value)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer',
                  isActive
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200/80'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{filter.label}</span>
              </button>
            );
          })}
        </div>

        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearChat}
            disabled={isStreaming}
            className="h-8 gap-1 text-xs text-slate-500 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Xóa hội thoại</span>
          </Button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 min-h-[380px] max-h-[620px] overflow-y-auto bg-slate-50/30">
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          onCitationClick={handleCitationClick}
        />
      </div>

      {/* Bottom Prompt Input Area */}
      <div className="border-t border-slate-100 bg-white p-4">
        <PromptInput
          onSend={sendMessage}
          onStop={stopStreaming}
          isStreaming={isStreaming}
          disabled={isLoading}
        />
      </div>

      {/* Citation Detail Drawer Dialog */}
      <CitationDrawer
        citation={selectedCitation}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
      />
    </Card>
  );
}
