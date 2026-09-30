export interface ParamDef {
  key: string;
  label: string;
  type?: string;
  defaultValue?: string;
  options?: string[];
}

export interface TemplateRow {
  id: number;
  name: string;
  category: string;
  description: string;
  subject: string;
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
  pageSize: string;
  source: string;
  builtinKey: string | null;
  params: ParamDef[];
  isActive: boolean;
  usageCount: number;
  createdByName: string | null;
}

export interface RecipientRow {
  id: number;
  firstName: string;
  lastName: string;
  nationalCode: string | null;
  personnelCode: string | null;
  rank: string | null;
  serviceUnit: string | null;
  serviceEndDate: string | null;
  phoneNumber?: string | null;
  physicalStatus?: string | null;
}

export interface LetterRow {
  id: number;
  batchId: number | null;
  templateId: number | null;
  templateName: string;
  soldierId: number | null;
  soldierName: string;
  nationalCode: string | null;
  serviceUnit: string | null;
  subject: string;
  letterNumber: string | null;
  letterDate: string | null;
  pageSize: string;
  status: string;
  createdByName: string | null;
  createdAt: string;
}

export interface BatchRow {
  id: number;
  title: string;
  templateName: string;
  total: number;
  source: string;
  createdByName: string | null;
  createdAt: string;
}
