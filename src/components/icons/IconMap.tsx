import React from 'react';
import {
  Buildings,
  CheckCircle,
  Circle,
  Clipboard,
  FileCode,
  Hash,
  Info,
  MapPin,
  ArrowClockwise,
  XCircle,
} from '@phosphor-icons/react';

export const iconMap = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  loading: ArrowClockwise,
  address: MapPin,
  number: Hash,
  boolean: Circle,
  bytes: FileCode,
  array: Clipboard,
  struct: Buildings,
} as const;

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
  
  if (!IconComponent) return <span>{name}</span>;

  return (
    <IconComponent 
      size={size} 
      className={className}
      style={color ? { color } : undefined}
    />
  );
};

export const UIIcons = {
  // Status
  success: <CheckCircle size={16} className="text-green-500" />,
  error: <XCircle size={16} className="text-red-500" />,
  info: <Info size={16} className="text-blue-500" />,
  loading: <ArrowClockwise size={16} className="animate-spin" />,
  
  // Data types
  address: <MapPin size={16} className="text-blue-400" />,
  number: <Hash size={16} className="text-green-400" />,
  boolean: <Circle size={16} className="text-purple-400" />,
  bytes: <FileCode size={16} className="text-orange-400" />,
  array: <Clipboard size={16} className="text-cyan-400" />,
  struct: <Buildings size={16} className="text-neutral-300" />,
};

export default Icon;
