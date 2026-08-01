<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StoreResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'slug' => $this->slug,
            'name' => $this->name,
            'bio' => $this->bio,
            'logo_url' => $this->logo_path ? asset('storage/'.$this->logo_path) : null,
            'banner_url' => $this->banner_path ? asset('storage/'.$this->banner_path) : null,
            'social_links' => $this->social_links ?? [],
            'is_active' => $this->isActive(),
        ];
    }
}
