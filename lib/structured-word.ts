import type { Json } from "@/types/database.types";

export interface CoreDefinition {
  partOfSpeech: string;
  senses: string[];
}

export interface CollocationItem {
  note: string | null;
  phrase: string;
}

export interface CorpusItem {
  note: string | null;
  text: string;
}

export interface SynonymItem {
  delta: string | null;
  object: string;
  semanticDiff: string;
  tone: string;
  usage: string;
  word: string;
}

export interface AntonymItem {
  note: string | null;
  word: string;
}

export interface StructuredWordFields {
  antonymItems: AntonymItem[];
  collocations: CollocationItem[];
  coreDefinitions: CoreDefinition[];
  corpusItems: CorpusItem[];
  prototypeText: string | null;
  synonymItems: SynonymItem[];
}

export interface StructuredParseWarning {
  errorMessage: string;
  errorStage: string;
  rawExcerpt: string | null;
}

export function createEmptyStructuredWordFields(): StructuredWordFields {
  return {
    antonymItems: [],
    collocations: [],
    coreDefinitions: [],
    corpusItems: [],
    prototypeText: null,
    synonymItems: [],
  };
}

export function isStructuredWordColumnsMissing(
  error: { code?: string; message?: string } | null,
) {
  if (!error) {
    return false;
  }

  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    error.message?.includes("core_definitions") === true ||
    error.message?.includes("prototype_text") === true ||
    error.message?.includes("collocations") === true ||
    error.message?.includes("corpus_items") === true ||
    error.message?.includes("synonym_items") === true ||
    error.message?.includes("antonym_items") === true
  );
}

export function castStructuredWordJson(fields: StructuredWordFields) {
  return {
    antonym_items: fields.antonymItems as unknown as Json,
    collocations: fields.collocations as unknown as Json,
    core_definitions: fields.coreDefinitions as unknown as Json,
    corpus_items: fields.corpusItems as unknown as Json,
    prototype_text: fields.prototypeText,
    synonym_items: fields.synonymItems as unknown as Json,
  };
}
