import { Body, Controller, Get, Post, Res, ServiceUnavailableException } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import { RenderService } from './render.service';

type CorpsRendu = { composition: string; props: Record<string, unknown>; crf?: number };

@Controller()
export class RenderController {
  constructor(private readonly renderService: RenderService) {}

  @Get('health')
  sante() {
    return { ok: true, pret: this.renderService.pret };
  }

  /** Compositions que ce service sait rendre (ids de src/Root.tsx). */
  @Get('compositions')
  compositions() {
    return { compositions: this.renderService.compositions() };
  }

  @Post('render')
  async rendre(@Body() body: CorpsRendu, @Res() res: Response) {
    if (!body?.composition || !body?.props) {
      res.status(400).json({ erreur: 'composition et props requis' });
      return;
    }
    try {
      const { chemin, dureeMs } = await this.renderService.render(body.composition, body.props, body.crf ?? 23);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Duree-Ms', String(dureeMs));
      const flux = fs.createReadStream(chemin);
      flux.pipe(res);
      flux.on('close', () => fs.unlink(chemin, () => {}));
      flux.on('error', () => fs.unlink(chemin, () => {}));
    } catch (e: any) {
      if (e instanceof ServiceUnavailableException) {
        res.status(503).json({ erreur: 'atelier_sature' });
        return;
      }
      res.status(500).json({ erreur: String(e?.message || e).slice(0, 800) });
    }
  }
}
