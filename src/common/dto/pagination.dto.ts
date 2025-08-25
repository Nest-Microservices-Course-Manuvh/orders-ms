import { Type } from "class-transformer";
import { IsOptional, Min } from "class-validator";


export class PaginationDto{

  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

}