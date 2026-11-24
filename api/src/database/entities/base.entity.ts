import { CreateDateColumn, UpdateDateColumn, PrimaryColumn } from 'typeorm';

export abstract class AppBaseEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
