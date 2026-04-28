export type OmniItemType =
  | "action"
  | "word"
  | "semantic-field"
  | "collection"
  | "navigation"
  | "setting";

export type OmniItem = {
  id: string;
  type: OmniItemType;
  title: string;
  subtitle?: string;
  href?: string;
  icon?: string;
  keywords?: string[];
  shortcut?: string;
  badge?: string;
  action?: () => void | Promise<void>;
};

export type OmniSection = {
  id: string;
  title: string;
  items: OmniItem[];
};
