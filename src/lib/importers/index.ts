import { appleHealthImporter } from './appleHealth';
import { fitImporter } from './fit';
import { stravaArchiveImporter } from './stravaArchive';
import { tcxImporter } from './tcx';
import { ImportError, type FileImporter } from './types';

export const FILE_IMPORTERS: FileImporter[] = [fitImporter, tcxImporter, stravaArchiveImporter, ...(appleHealthImporter ? [appleHealthImporter] : [])];

export function importerFor(fileName: string): FileImporter {
  const lower = fileName.toLowerCase();
  const imp = FILE_IMPORTERS.find((i) => i.extensions.some((ext) => lower.endsWith(ext)));
  if (!imp) throw new ImportError(`unsupported file type. Choose a ${FILE_IMPORTERS.flatMap((i) => i.extensions).join(' or ')} file`);
  return imp;
}
