import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import mediaConfig, { type MediaConfig } from '@/config/media.config';
import { AdminMediaController } from './controllers/admin-media.controller';
import { MediaController } from './controllers/media.controller';
import { Media } from './entities/media.entity';
import { LocalDiskStorage } from './services/local-disk-storage';
import { AdminMediaService } from './services/admin-media.service';
import { MediaService } from './services/media.service';
import { MEDIA_STORAGE } from './types/media.types';

/**
 * Uploaded images: the upload routes (/api/media, editors only),
 * MediaService and the file storage. Shares the Media repository with the
 * modules that return media (catalog, blog, pages). configureApp() serves
 * the files at /uploads.
 */
@Module({
  imports: [
    ConfigModule.forFeature(mediaConfig),
    TypeOrmModule.forFeature([Media]),
  ],
  controllers: [MediaController, AdminMediaController],
  providers: [
    {
      provide: MEDIA_STORAGE,
      inject: [mediaConfig.KEY],
      useFactory: async ({ uploadsDir }: MediaConfig) => {
        const storage = new LocalDiskStorage(uploadsDir);
        await storage.init();
        return storage;
      },
    },
    MediaService,
    AdminMediaService,
  ],
  exports: [TypeOrmModule, MediaService],
})
export class MediaModule {}
