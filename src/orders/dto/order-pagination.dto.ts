import { IsEnum, IsOptional } from "class-validator";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { OrderStatusList } from "src/orders/enums/order.enum";
import { OrderStatus } from "generated/prisma";

export class OrderPaginationDto extends PaginationDto{

  @IsOptional()
  @IsEnum(OrderStatusList)
  status: OrderStatus;

}