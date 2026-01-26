// DTOs (Data Transfer Objects) cho validation

import { IsInt, IsArray, IsNumber, Min, Max, IsOptional } from 'class-validator';

export class ForecastDto {
  @IsInt()
  segmentId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  horizonMinutes: number = 60;
}

export class RoutingDto {
  @IsArray()
  @IsNumber({}, { each: true })
  startPoint: [number, number];

  @IsArray()
  @IsNumber({}, { each: true })
  endPoint: [number, number];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  blockedSegments?: number[];
}

export class SegmentQueryDto {
  @IsOptional()
  @IsInt()
  limit: number = 100;

  @IsOptional()
  @IsInt()
  offset: number = 0;
}
