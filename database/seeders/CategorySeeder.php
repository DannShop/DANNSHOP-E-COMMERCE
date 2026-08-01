<?php

namespace Database\Seeders;

use App\Domain\Product\Models\Category;
use Illuminate\Database\Seeder;

/**
 * Database Architecture v2 §3.3: type_scope lets the Add Product form
 * filter which categories are relevant to the product_type the seller
 * already picked (e.g. "Akun Premium" categories shouldn't appear when
 * the seller is creating a digital_file product). These are starting
 * defaults, not exhaustive — sellers will likely need more specific
 * categories over time, but this is enough for MVP launch so the
 * category dropdown isn't empty on day one.
 */
class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['name' => 'Ebook & Panduan', 'slug' => 'ebook-panduan', 'type_scope' => 'digital'],
            ['name' => 'Template Notion', 'slug' => 'template-notion', 'type_scope' => 'digital'],
            ['name' => 'Template Canva', 'slug' => 'template-canva', 'type_scope' => 'digital'],
            ['name' => 'File Desain', 'slug' => 'file-desain', 'type_scope' => 'digital'],
            ['name' => 'Akun Streaming', 'slug' => 'akun-streaming', 'type_scope' => 'general'],
            ['name' => 'Akun Premium Lainnya', 'slug' => 'akun-premium-lainnya', 'type_scope' => 'general'],
            ['name' => 'Jasa Desain', 'slug' => 'jasa-desain', 'type_scope' => 'service'],
            ['name' => 'Jasa Coding', 'slug' => 'jasa-coding', 'type_scope' => 'service'],
            ['name' => 'Jasa Lainnya', 'slug' => 'jasa-lainnya', 'type_scope' => 'service'],
            ['name' => 'Top Up Game', 'slug' => 'topup-game', 'type_scope' => 'topup'],
            ['name' => 'Pulsa & Kuota', 'slug' => 'pulsa-kuota', 'type_scope' => 'ppob'],
        ];

        foreach ($categories as $category) {
            Category::query()->firstOrCreate(['slug' => $category['slug']], $category);
        }
    }
}
