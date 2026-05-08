declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  interface IntrinsicAttributes {
    key?: any;
  }
}

declare module "react" {
  export type ReactNode = any;
  export type FC<P = {}> = (props: P) => any;
  export interface Context<T> { Provider: any; __type?: T }
  export const createContext: <T>(defaultValue: T) => Context<T>;
  export const useContext: <T>(context: Context<T>) => T;
  export const useCallback: <T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]) => T;
  export const useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
  export const useMemo: <T>(factory: () => T, deps: readonly unknown[]) => T;
  export const useRef: <T>(value: T) => { current: T };
  export const useState: <T>(value: T | (() => T)) => [T, (value: T | ((prev: T) => T)) => void];
}

declare module "react/jsx-runtime" {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module "ethers" {
  export class JsonRpcSigner {}
  export class BrowserProvider {
    constructor(provider: unknown);
    getNetwork(): Promise<{ chainId: bigint }>;
    getSigner(address?: string): Promise<JsonRpcSigner>;
  }
}

declare module "@/lib/recruiterApi" {
  export function syncWalletRecruiterAttribution(address: string): Promise<void>;
}

declare module "framer-motion" {
  export const AnimatePresence: any;
  export const motion: any;
}

declare module "lucide-react" {
  export const AlertTriangle: any;
  export const CheckCircle2: any;
  export const ExternalLink: any;
  export const Loader2: any;
  export const RefreshCcw: any;
  export const ShieldCheck: any;
  export const Sparkles: any;
  export const Wallet: any;
  export const X: any;
}

declare module "react-dom" {
  export function createPortal(children: unknown, container: Element | DocumentFragment): any;
}

declare module "sonner" {
  export const toast: {
    success(message: string): void;
    error(message: string): void;
    message(message: string): void;
  };
}
