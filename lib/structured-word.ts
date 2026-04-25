import { asJson } from "@/types/database.types";

export interface CoreDefinition {
  partOfSpeech: string;
  senses: string[];
}

export interface CollocationItem {
  examples: CollocationExample[];
  gloss: string | null;
  note: string | null;
  phrase: string;
}

export interface CollocationExample {
  text: string;
  translation: string | null;
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
    antonym_items: asJson(fields.antonymItems),
    collocations: asJson(fields.collocations),
    core_definitions: asJson(fields.coreDefinitions),
    corpus_items: asJson(fields.corpusItems),
    prototype_text: fields.prototypeText,
    synonym_items: asJson(fields.synonymItems),
  };
}
