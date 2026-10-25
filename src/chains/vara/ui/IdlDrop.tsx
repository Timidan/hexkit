import AnimatedFileUpload from "../../../components/smoothui/ui/AnimatedFileUpload";

/** Single-IDL drop zone (SmoothUI AnimatedFileUpload); hands the file text to the caller. */
export function IdlDrop({ onText, disabled }: { onText: (text: string, name: string) => void; disabled?: boolean }) {
  return (
    <AnimatedFileUpload
      accept=".idl,.txt"
      multiple={false}
      maxSize={2 * 1024 * 1024}
      disabled={disabled}
      onFilesSelected={(files) => {
        const file = files[0];
        if (file) void file.text().then((text) => onText(text, file.name));
      }}
    />
  );
}
