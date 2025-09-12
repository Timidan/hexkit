import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Check, AlertCircle } from 'lucide-react';

interface AnimatedInputProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password' | 'email' | 'url' | 'textarea';
  placeholder?: string;
  error?: string;
  success?: boolean;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
  rows?: number;
  autoComplete?: string;
  icon?: React.ReactNode;
  className?: string;
}

const AnimatedInput: React.FC<AnimatedInputProps> = ({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  success,
  disabled,
  required,
  maxLength,
  rows = 4,
  autoComplete,
  icon,
  className = ''
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const hasValue = value.length > 0;
  const showFloatingLabel = isFocused || hasValue;
  const inputType = type === 'password' && showPassword ? 'text' : type;

  useEffect(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    if (isFocused && value) {
      setIsTyping(true);
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
      }, 500);
    } else {
      setIsTyping(false);
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setIsTyping(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const containerVariants = {
    idle: {
      borderColor: 'var(--border-primary)',
      boxShadow: 'var(--shadow-sm)',
    },
    focused: {
      borderColor: 'var(--accent-primary)',
      boxShadow: 'var(--glow-cyan), var(--shadow-md)',
      scale: 1.02,
    },
    error: {
      borderColor: 'var(--error)',
      boxShadow: 'var(--glow-magenta), var(--shadow-md)',
    },
    success: {
      borderColor: 'var(--success)',
      boxShadow: 'var(--glow-green), var(--shadow-md)',
    },
  };

  const labelVariants = {
    floating: {
      y: -32,
      scale: 0.85,
      color: 'var(--accent-primary)',
      fontWeight: 600,
    },
    default: {
      y: 0,
      scale: 1,
      color: 'var(--text-tertiary)',
      fontWeight: 500,
    },
  };

  const iconVariants = {
    idle: { 
      scale: 1, 
      color: 'var(--text-tertiary)' 
    },
    active: { 
      scale: 1.1, 
      color: 'var(--accent-primary)',
      rotate: [0, -10, 10, 0],
      transition: { duration: 0.3 }
    },
  };

  const getContainerState = () => {
    if (error) return 'error';
    if (success) return 'success';
    if (isFocused) return 'focused';
    return 'idle';
  };

  const InputComponent = type === 'textarea' ? motion.textarea : motion.input;

  return (
    <div className={`animated-input-wrapper ${className}`}>
      <motion.div
        className="animated-input-container"
        variants={containerVariants}
        animate={getContainerState()}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* Background glow effect */}
        <motion.div
          className="input-glow"
          initial={{ opacity: 0 }}
          animate={{ 
            opacity: isFocused ? 0.1 : 0,
            scale: isFocused ? 1.05 : 1,
          }}
          transition={{ duration: 0.3 }}
        />

        {/* Icon */}
        {icon && (
          <motion.div
            className="input-icon"
            variants={iconVariants}
            animate={isFocused || hasValue ? 'active' : 'idle'}
          >
            {icon}
          </motion.div>
        )}

        {/* Input field */}
        <InputComponent
          ref={inputRef as any}
          id={id}
          type={inputType}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          autoComplete={autoComplete}
          rows={type === 'textarea' ? rows : undefined}
          className="animated-input-field"
          placeholder={showFloatingLabel ? placeholder : ''}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        />

        {/* Floating label */}
        <motion.label
          htmlFor={id}
          className="animated-input-label"
          variants={labelVariants}
          animate={showFloatingLabel ? 'floating' : 'default'}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {label}
          {required && <span className="required-asterisk">*</span>}
        </motion.label>

        {/* Password toggle */}
        {type === 'password' && (
          <motion.button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </motion.button>
        )}

        {/* Status icon */}
        <AnimatePresence>
          {(success || error) && (
            <motion.div
              className="status-icon"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              {success && <Check size={16} className="text-success" />}
              {error && <AlertCircle size={16} className="text-error" />}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {isTyping && (
            <motion.div
              className="typing-indicator"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '100%', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
          )}
        </AnimatePresence>

        {/* Character count */}
        {maxLength && hasValue && (
          <motion.div
            className="char-count"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {value.length} / {maxLength}
          </motion.div>
        )}
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="error-message"
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AlertCircle size={14} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AnimatedInput;