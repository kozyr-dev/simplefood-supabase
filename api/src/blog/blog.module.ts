import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from '@/media/entities/media.entity';
import { AdminBlogCategoriesController } from './controllers/admin-blog-categories.controller';
import { AdminBlogPostsController } from './controllers/admin-blog-posts.controller';
import { AdminBlogCategoriesService } from './services/admin-blog-categories.service';
import { AdminBlogPostsService } from './services/admin-blog-posts.service';
import { BlogCategory } from './entities/blog-category.entity';
import { BlogPost } from './entities/blog-post.entity';
import { BlogCategoriesController } from './controllers/blog-categories.controller';
import { BlogCategoriesService } from './services/blog-categories.service';
import { BlogPostsController } from './controllers/blog-posts.controller';
import { BlogPostsService } from './services/blog-posts.service';

/** Blog posts and their categories: the public reads and the admin's /api/admin routes. */
@Module({
  imports: [TypeOrmModule.forFeature([BlogPost, BlogCategory, Media])],
  controllers: [
    BlogPostsController,
    BlogCategoriesController,
    AdminBlogPostsController,
    AdminBlogCategoriesController,
  ],
  providers: [
    BlogPostsService,
    BlogCategoriesService,
    AdminBlogPostsService,
    AdminBlogCategoriesService,
  ],
})
export class BlogModule {}
