import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

/**
 * Rendu Remotion en PROCESS Node, sans passer par un sous-processus `npx remotion render`
 * (l'appel que faisait backend/services/remotion_service.py). Deux gains concrets :
 *
 * 1. Le bundle (webpack) des compositions se fait UNE SEULE FOIS au démarrage de ce service,
 *    pas à chaque rendu : c'était une bonne partie des 50-90 s observés par rendu.
 * 2. Plus de sous-processus ni de fichier de props temporaire : appel direct à l'API Node
 *    de Remotion (@remotion/renderer), le même moteur que `remotion render` en coulisses.
 *
 * Compositions inchangées : ce service pointe sur ../src/index.ts, exactement le projet
 * existant (backend/remotion/src), rien n'est dupliqué.
 */
@Injectable()
export class RenderService implements OnModuleInit {
  private readonly logger = new Logger(RenderService.name);
  private serveUrl: string | null = null;
  private bundling: Promise<string> | null = null;

  // Un rendu Remotion sature déjà les coeurs du conteneur (même raison que l'ancien
  // threading.Semaphore côté Python) : on plafonne la concurrence ici, au plus près du
  // travail réel, au lieu de la dupliquer côté appelant HTTP.
  private readonly maxConcurrent = Number(process.env.REMOTION_RENDUS_SIMULTANES || 2);
  private enCours = 0;

  async onModuleInit() {
    await this.assurerBundle();
  }

  private async assurerBundle(): Promise<string> {
    if (this.serveUrl) return this.serveUrl;
    if (!this.bundling) {
      const entryPoint = path.join(__dirname, '..', 'src', 'index.ts');
      this.logger.log(`Bundling des compositions (${entryPoint})…`);
      const depart = Date.now();
      this.bundling = bundle({ entryPoint, onProgress: () => {} }).then((url) => {
        this.serveUrl = url;
        this.logger.log(`Bundle prêt en ${Date.now() - depart} ms : ${url}`);
        return url;
      });
    }
    return this.bundling;
  }

  get pret(): boolean {
    return !!this.serveUrl;
  }

  /** Les ids de composition déclarés dans src/Root.tsx (ex. ReelSequence, StoryAnime…).
   * Exposé en GET /compositions : un backend sans projet Remotion local (le NestJS sur
   * Railway) l'interroge pour ne réclamer dans la file partagée que les jobs que CE
   * service sait rendre. Lu une fois (le fichier ne change pas en cours de route). */
  compositions(): string[] {
    if (this.compositionsCache) return this.compositionsCache;
    try {
      const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'Root.tsx'), 'utf-8');
      const ids = new Set<string>();
      for (const m of src.matchAll(/id="([A-Za-z0-9_-]+)"/g)) ids.add(m[1]);
      this.compositionsCache = [...ids].sort();
    } catch (e: any) {
      this.logger.warn(`Root.tsx illisible : ${e?.message || e}`);
      this.compositionsCache = [];
    }
    return this.compositionsCache;
  }
  private compositionsCache: string[] | null = null;

  async render(composition: string, props: Record<string, unknown>, crf: number): Promise<{ chemin: string; dureeMs: number }> {
    if (this.enCours >= this.maxConcurrent) {
      throw new ServiceUnavailableException('atelier_sature');
    }
    this.enCours += 1;
    const depart = Date.now();
    try {
      const serveUrl = await this.assurerBundle();
      const comp = await selectComposition({ serveUrl, id: composition, inputProps: props });
      const outPath = path.join(os.tmpdir(), `remotion_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`);
      await renderMedia({
        composition: comp,
        serveUrl,
        codec: 'h264',
        outputLocation: outPath,
        inputProps: props,
        crf,
        timeoutInMilliseconds: 120000,
        ...(process.env.REMOTION_BROWSER ? { browserExecutable: process.env.REMOTION_BROWSER as any } : {}),
      });
      if (!fs.existsSync(outPath)) throw new Error('rendu terminé sans fichier de sortie');
      return { chemin: outPath, dureeMs: Date.now() - depart };
    } finally {
      this.enCours -= 1;
    }
  }
}
