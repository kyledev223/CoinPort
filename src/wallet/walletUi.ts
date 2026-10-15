import { create } from "zustand";

/** Which wallet dialog is open: the picker, or install help for a wallet that isn't installed. */
interface WalletUi {
  pickerOpen: boolean;
  /** Name of the wallet whose install steps are showing. */
  helpFor: string | null;
  openPicker(): void;
  showHelp(walletName: string): void;
  close(): void;
}

export const useWalletUi = create<WalletUi>()((set) => ({
  pickerOpen: false,
  helpFor: null,
  openPicker: () => set({ pickerOpen: true, helpFor: null }),
  showHelp: (helpFor) => set({ pickerOpen: false, helpFor }),
  close: () => set({ pickerOpen: false, helpFor: null }),
}));
