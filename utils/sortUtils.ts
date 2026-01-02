/**
 * Sorts an array of objects based on a string property using "Natural Sort" order.
 * This ensures "Page 2.jpg" comes before "Page 10.jpg".
 */
export const naturalSort = <T>(array: T[], keySelector: (item: T) => string): T[] => {
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
  });

  return [...array].sort((a, b) => {
    return collator.compare(keySelector(a), keySelector(b));
  });
};

export const isImage = (file: File) => file.type.startsWith('image/') || /\.(jpe?g|png|tiff?|bmp)$/i.test(file.name);
export const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
