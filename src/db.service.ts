import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class DbService implements OnModuleDestroy {
  public pool: Pool;

  constructor(private readonly config: ConfigService) {
    const databaseUrl = this.config.get<string>('DATABASE_URL');
    this.pool = new Pool({ connectionString: databaseUrl, ssl: false });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
