import React from 'react';
import {
  Wrench,
  FileText,
  Building2,
  Zap,
  Target,
  Trash2,
  Clipboard,
  TrendingUp,
  BarChart3,
  Search,
  CheckCircle,
  XCircle,
  Settings,
  Globe,
  Lightbulb,
  Rocket,
  MapPin,
  Hash,
  Circle,
  FileCode,
  Dot,
  Plus,
  HelpCircle,
  RotateCw,
  BookOpen,
  Sparkles,
  Clock,
  Palette,
  Lock,
  Package,
  Monitor,
  Smartphone,
  Star,
  Construction,
  Code,
  Database,
  Eye,
  Download,
  Upload,
  Edit,
  Save,
  Maximize,
  Minimize,
  ChevronDown,
  ChevronRight,
  Filter,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Home,
  Users,
  Shield,
  AlertTriangle,
  Info,
  Play,
  Pause
} from 'lucide-react';
import { CopyIcon } from './IconLibrary';

// Icon mapping from emojis to Lucide icons
export const iconMap = {} as Record<string, React.ComponentType<any>>;

// Icon component wrapper with consistent styling
interface IconProps {
  name: keyof typeof iconMap;
  size?: number;
  className?: string;
  color?: string;
}

export const Icon: React.FC<IconProps> = ({ 
  name, 
  size = 16, 
  className = '', 
  color 
}) => {
  const IconComponent = iconMap[name];
  
  if (!IconComponent) {
    console.warn(`Icon "${name}" not found in iconMap`);
    return <span>{name}</span>; // Fallback to emoji if icon not found
  }
  
  return (
    <IconComponent 
      size={size} 
      className={className}
      style={color ? { color } : undefined}
    />
  );
};

// Predefined icon sets for common use cases
export const UIIcons = {
  // Navigation
  home: <Home size={16} />,
  back: <ArrowLeft size={16} />,
  forward: <ArrowRight size={16} />,
  external: <ExternalLink size={16} />,
  
  // Actions
  search: <Search size={16} />,
  filter: <Filter size={16} />,
  refresh: <RefreshCw size={16} />,
  copy: <CopyIcon width={16} height={16} />,
  edit: <Edit size={16} />,
  save: <Save size={16} />,
  delete: <Trash2 size={16} />,
  add: <Plus size={16} />,
  
  // Status
  success: <CheckCircle size={16} className="text-green-500" />,
  error: <XCircle size={16} className="text-red-500" />,
  warning: <AlertTriangle size={16} className="text-yellow-500" />,
  info: <Info size={16} className="text-blue-500" />,
  loading: <RotateCw size={16} className="animate-spin" />,
  
  // Data types
  address: <MapPin size={16} className="text-blue-400" />,
  number: <Hash size={16} className="text-green-400" />,
  boolean: <Circle size={16} className="text-purple-400" />,
  bytes: <FileCode size={16} className="text-orange-400" />,
  array: <Clipboard size={16} className="text-cyan-400" />,
  struct: <Building2 size={16} className="text-indigo-400" />,
  
  // Interface
  expand: <ChevronDown size={16} />,
  collapse: <ChevronRight size={16} />,
  fullscreen: <Maximize size={16} />,
  minimize: <Minimize size={16} />,
  
  // Tools
  generator: <FileText size={16} />,
  decoder: <Search size={16} />,
  builder: <Building2 size={16} />,
  database: <Database size={16} />,
  settings: <Settings size={16} />
};

export default Icon;
