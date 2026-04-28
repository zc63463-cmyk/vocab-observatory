"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

/* ─── State ─── */

interface OmniState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
}

type OmniAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "SET_QUERY"; query: string }
  | { type: "SET_SELECTED_INDEX"; index: number }
  | { type: "RESET" };

const initialState: OmniState = {
  isOpen: false,
  query: "",
  selectedIndex: 0,
};

function omniReducer(state: OmniState, action: OmniAction): OmniState {
  switch (action.type) {
    case "OPEN":
      return { ...state, isOpen: true };
    case "CLOSE":
      return { ...initialState };
    case "SET_QUERY":
      return { ...state, query: action.query, selectedIndex: 0 };
    case "SET_SELECTED_INDEX":
      return { ...state, selectedIndex: action.index };
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

/* ─── Context ─── */

interface OmniContextValue {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;
  reset: () => void;
}

const OmniContext = createContext<OmniContextValue | null>(null);

export function OmniProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(omniReducer, initialState);

  const open = useCallback(() => dispatch({ type: "OPEN" }), []);
  const close = useCallback(() => dispatch({ type: "CLOSE" }), []);
  const toggle = useCallback(
    () => dispatch({ type: state.isOpen ? "CLOSE" : "OPEN" }),
    [state.isOpen],
  );
  const setQuery = useCallback(
    (query: string) => dispatch({ type: "SET_QUERY", query }),
    [],
  );
  const setSelectedIndex = useCallback(
    (index: number) => dispatch({ type: "SET_SELECTED_INDEX", index }),
    [],
  );
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  const value = useMemo<OmniContextValue>(
    () => ({
      ...state,
      open,
      close,
      toggle,
      setQuery,
      setSelectedIndex,
      reset,
    }),
    [state, open, close, toggle, setQuery, setSelectedIndex, reset],
  );

  return (
    <OmniContext.Provider value={value}>{children}</OmniContext.Provider>
  );
}

export function useOmniStore(): OmniContextValue {
  const ctx = useContext(OmniContext);
  if (!ctx) {
    throw new Error("useOmniStore must be used within an OmniProvider");
  }
  return ctx;
}
