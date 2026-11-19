import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { CHAT_EMOJI_CATEGORIES } from '../lib/chatEmojis.ts';

interface EmojiPickerPanelProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  title?: string;
  activeEmoji?: string | null;
  className?: string;
}

export const EmojiPickerPanel: React.FC<EmojiPickerPanelProps> = ({
  onSelect,
  onClose,
  title = 'Select Emoji',
  activeEmoji,
  className = '',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const visibleCategories = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return CHAT_EMOJI_CATEGORIES.filter((cat) => {
      if (selectedCategory !== 'all' && cat.id !== selectedCategory) return false;
      if (!q) return true;
      return cat.label.toLowerCase().includes(q) || cat.emojis.some((e) => e.includes(q));
    });
  }, [selectedCategory, searchTerm]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`w-[300px] sm:w-[340px] bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden flex flex-col ${className}`}
    >
      <div className="px-3 py-2 border-b border-neutral-100 bg-[#F0F2F5] flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-[#111B21] truncate">{title}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[#54656F] hover:bg-neutral-200/70"
            aria-label="Close emoji picker"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category Filter Tabs */}
      <div className="px-2 py-1.5 border-b border-neutral-100 bg-white flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`px-2 py-1 rounded-md text-[10px] font-semibold shrink-0 transition-colors ${
            selectedCategory === 'all'
              ? 'bg-[#008069] text-white'
              : 'bg-neutral-100 text-[#54656F] hover:bg-neutral-200'
          }`}
        >
          All
        </button>
        {CHAT_EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            title={cat.label}
            className={`px-2 py-1 rounded-md text-xs shrink-0 transition-colors flex items-center gap-1 ${
              selectedCategory === cat.id
                ? 'bg-[#008069] text-white'
                : 'bg-neutral-100 text-[#54656F] hover:bg-neutral-200'
            }`}
          >
            <span>{cat.icon}</span>
          </button>
        ))}
      </div>

      {/* Quick Category Search */}
      <div className="px-2.5 py-1.5 border-b border-neutral-100 bg-white">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#667781] absolute start-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter category (smileys, nature, food...)"
            className="w-full ps-8 pe-2.5 py-1 text-[11px] rounded-md bg-[#F0F2F5] border border-transparent focus:border-[#008069] focus:bg-white focus:outline-none text-[#111B21]"
          />
        </div>
      </div>

      {/* Scrollable Categorized Emoji Grid */}
      <div className="max-h-64 overflow-y-auto p-2.5 space-y-3 bg-white">
        {visibleCategories.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-[#667781]">No matching emoji categories</div>
        ) : (
          visibleCategories.map((cat) => (
            <div key={cat.id}>
              <div className="text-[10px] font-bold tracking-wider uppercase text-[#667781] mb-1.5 px-0.5">
                {cat.label}
              </div>
              <div className="grid grid-cols-8 sm:grid-cols-9 gap-1">
                {cat.emojis.map((emoji, idx) => {
                  const isActive = activeEmoji === emoji;
                  return (
                    <button
                      key={`${cat.id}-${idx}-${emoji}`}
                      type="button"
                      onClick={() => onSelect(emoji)}
                      className={`h-8 w-8 rounded-md flex items-center justify-center text-lg transition-transform hover:scale-125 hover:bg-neutral-100 ${
                        isActive ? 'bg-emerald-100 ring-1 ring-[#008069]' : ''
                      }`}
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
