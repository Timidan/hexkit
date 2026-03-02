export type ClipboardResult = 'success' | 'error';

const createHiddenTextarea = (text: string): HTMLTextAreaElement => {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  textarea.style.fontSize = '12px';
  return textarea;
};

const restoreSelection = (
  selection: Selection | null,
  range: Range | null
) => {
  if (!selection || !range) return;
  try {
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Ignore range restore failures
  }
};

export const copyTextToClipboard = async (text: string): Promise<void> => {
  if (typeof text !== 'string') {
    throw new Error('Clipboard: value must be a string');
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Clipboard: no text to copy');
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(trimmed);
    return;
  }

  const textarea = createHiddenTextarea(trimmed);
  document.body.appendChild(textarea);

  const selection = document.getSelection ? document.getSelection() : null;
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let succeeded = false;
  try {
    succeeded = document.execCommand('copy');
  } catch {
    succeeded = false;
  }

  document.body.removeChild(textarea);
  restoreSelection(selection, previousRange);

  if (!succeeded) {
    throw new Error('Clipboard: document.execCommand failed');
  }
};
