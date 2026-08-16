declare global {
  interface Window {
    /**
     * Navigate to the auth page with a custom redirect URL
     * @param redirectUrl - URL to redirect to after successful authentication
     */
    navigateToAuth: (redirectUrl: string) => void;
  }
}

// Fallback declaration for environments where @radix-ui/react-select ships
// without usable type declarations (TS7016). The package normally provides
// its own types via the exports map, which take precedence when present.
declare module "@radix-ui/react-select";

export {};