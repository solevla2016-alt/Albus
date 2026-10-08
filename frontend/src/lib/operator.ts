export const OPERATOR = {
  /** Наименование или ФИО оператора персональных данных. */
  name: "",
  /** Почтовый адрес для обращений субъектов персональных данных. */
  email: "",
  /** Адрес места нахождения. */
  address: "",
  /** ИНН. Обязателен для юридического лица и ИП. */
  inn: "",
  /** ОГРН. Обязателен для юридического лица. */
  ogrn: "",
  /** Дата вступления редакции политики в силу. */
  effectiveFrom: "2026-10-07",
};

export function hasRequisites(): boolean {
  return Boolean(OPERATOR.name && OPERATOR.email && OPERATOR.address);
}