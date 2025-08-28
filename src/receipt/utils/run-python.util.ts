import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Ejecuta un binario/executable (ej: .py compilado o .exe) y retorna su salida.
 *
 * @param exePath Ruta absoluta o relativa al ejecutable
 * @param args Arreglo de argumentos que se pasarán al ejecutable
 * @returns stdout limpio
 */
export async function runExecutable(exePath: string, args: string[] = []): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(exePath, args);

    if (stderr) {
      console.error(`Error, STDERR de ${exePath}:`, stderr);
    }

    //console.log(`PYTHON RESULT CONSOLE:${exePath}:`, stdout);
    return stdout.trim();
  } catch (error) {
    console.error(`Error ejecutando ${exePath}:`, error);
    throw error;
  }
}
