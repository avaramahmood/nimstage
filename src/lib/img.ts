/** Public URL of an uploaded artwork key (see server/routes/images.ts). null means "use the generated art". */
export const imgUrl = (key: string | null | undefined) => (key ? `/api/img/${key}` : null);
