import React, { useState, useRef, useEffect } from "react";
import { Bug } from "@phosphor-icons/react";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import type { TraceFilters, SearchCategory } from "./traceTypes";
import { SEARCH_CATEGORIES } from "./traceTypes";

interface TraceToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchCategory: SearchCategory;
  onSearchCategoryChange: (category: SearchCategory) => void;
  filters: TraceFilters;
  onFilterChange: (key: keyof TraceFilters) => void;
  slotXRefEnabled: boolean;
  onSlotXRefChange: () => void;
  hasRevert?: boolean;
  onGoToRevert?: () => void;
  debugSession: any;
  openDebugAtRevert: () => void;
}

const TraceToolbar: React.FC<TraceToolbarProps> = ({
  searchQuery,
  onSearchChange,
  searchCategory,
  onSearchCategoryChange,
  filters,
  onFilterChange,
  slotXRefEnabled,
  onSlotXRefChange,
  hasRevert,
  onGoToRevert,
  debugSession,
  openDebugAtRevert,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const activeLabel = SEARCH_CATEGORIES.find(c => c.value === searchCategory)?.label || "All";

  return (
    <div className="exec-trace-toolbar">
      <div className="exec-trace-search">
        <Input
          type="search"
          placeholder={searchCategory === 'all' ? "Search" : `Search by ${activeLabel}`}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="exec-search-input"
        />
        <div className="exec-search-category-wrapper" ref={dropdownRef}>
          <Button
            variant="outline"
            size="sm"
            className={`exec-dropdown-btn exec-all-btn${searchCategory !== 'all' ? ' exec-all-btn--active' : ''}`}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            {activeLabel} <span className="exec-dropdown-caret">&#9662;</span>
          </Button>
          {dropdownOpen && (
            <div className="exec-search-category-dropdown">
              {SEARCH_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  className={`exec-search-category-item${searchCategory === cat.value ? ' active' : ''}`}
                  onClick={() => {
                    onSearchCategoryChange(cat.value);
                    setDropdownOpen(false);
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="exec-trace-filters">
        <div className="exec-filter-checkbox">
          <Checkbox
            id="filter-gas"
            checked={filters.gas}
            onCheckedChange={() => onFilterChange("gas")}
          />
          <Label htmlFor="filter-gas" className="exec-checkbox-label">
            Gas
          </Label>
        </div>

        <div className="exec-filter-checkbox">
          <Checkbox
            id="filter-full"
            checked={filters.full}
            onCheckedChange={() => onFilterChange("full")}
          />
          <Label htmlFor="filter-full" className="exec-checkbox-label">
            Full Trace
          </Label>
        </div>

        <div className="exec-filter-checkbox">
          <Checkbox
            id="filter-storage"
            checked={filters.storage}
            onCheckedChange={() => onFilterChange("storage")}
          />
          <Label htmlFor="filter-storage" className="exec-checkbox-label">
            Storage
          </Label>
        </div>

        <div className="exec-filter-checkbox">
          <Checkbox
            id="filter-events"
            checked={filters.events}
            onCheckedChange={() => onFilterChange("events")}
          />
          <Label htmlFor="filter-events" className="exec-checkbox-label">
            Events
          </Label>
        </div>

        <div className="exec-filter-checkbox">
          <Checkbox
            id="filter-slot-xref"
            checked={slotXRefEnabled}
            onCheckedChange={onSlotXRefChange}
          />
          <Label htmlFor="filter-slot-xref" className="exec-checkbox-label">
            Slot X-Ref
          </Label>
        </div>

        {hasRevert && onGoToRevert && (
          <Button
            variant="destructive"
            size="sm"
            className="exec-revert-btn"
            onClick={onGoToRevert}
          >
            Go to Revert
          </Button>
        )}
        {hasRevert && debugSession && (
          <Button
            variant="outline"
            size="sm"
            className="exec-debug-revert-btn gap-1.5"
            onClick={openDebugAtRevert}
          >
            <Bug size={14} />
            Debug Revert
          </Button>
        )}
      </div>
    </div>
  );
};

export default TraceToolbar;
