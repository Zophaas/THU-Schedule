import { useEffect, useRef } from 'react';

/**
 * Opens a <dialog> as a modal on mount. Closing is driven by React state: call the
 * returned `close` (close buttons, Cancel) and the parent unmounts the dialog. Esc is
 * handled here too. The native `close` event is only a fallback, because some browsers
 * never fire it, which left a hidden dialog mounted that could not be opened again.
 *
 * closeOnBackdrop: a click outside the dialog box closes it. Off by default so forms
 * with unsaved input are not dismissed by a stray click.
 */
export function useModal(onClose: () => void, options: { closeOnBackdrop?: boolean } = {}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeOnBackdrop = options.closeOnBackdrop ?? false;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const handleClose = () => onCloseRef.current();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
    };

    // Clicks on the backdrop target the <dialog> element itself, outside its box.
    // Require both press and release outside, so selecting text and releasing
    // outside the box does not close it.
    const outside = (event: MouseEvent) => {
      if (event.target !== dialog) return false;
      const box = dialog.getBoundingClientRect();
      return (
        event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
      );
    };
    let pressedOutside = false;
    const handleDown = (event: MouseEvent) => {
      pressedOutside = outside(event);
    };
    const handleClick = (event: MouseEvent) => {
      if (pressedOutside && outside(event)) onCloseRef.current();
      pressedOutside = false;
    };

    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('keydown', handleKey);
    if (closeOnBackdrop) {
      dialog.addEventListener('mousedown', handleDown);
      dialog.addEventListener('click', handleClick);
    }
    // No close() in cleanup: StrictMode re-runs effects, and a queued close event
    // would then dismiss the dialog right after it reopened.
    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('keydown', handleKey);
      dialog.removeEventListener('mousedown', handleDown);
      dialog.removeEventListener('click', handleClick);
    };
  }, [closeOnBackdrop]);

  return { ref, close: () => onCloseRef.current() };
}
