/** biome-ignore-all lint/performance/noBarrelFile: index is the only allowed file where we can export other files */

export { FileNotFoundError, FileValidationError } from './errors.js';
export {
  type CreateFilesContextResult,
  createFilesContext,
  type FileHandle,
  type FileSpec,
} from './files.js';
export { osHomeConfigDir, osHomeDir } from './paths.js';
