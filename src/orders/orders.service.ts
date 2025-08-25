import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaClient } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { CreateOrderDto, ChangeOrderStatusDto, OrderPaginationDto } from './dto';
import { NATS_SERVICE } from 'src/config';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  private readonly logger = new Logger('OrdersService');

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database Connected');
  }

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy
  ) {
    super();
  }

  async create(createOrderDto: CreateOrderDto) {

    try {

      // Check products
      const productIds = createOrderDto.items.map(item => item.productId);

      const products = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productIds)
      );

      // Calulate product prices
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find((product) => product.id === orderItem.productId).price;

        return acc + (price * orderItem.quantity);
      }, 0);

      const totalItems = createOrderDto.items.reduce( (acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0);

      // Create database transaction
      const order = await this.order.create({
        data: {
          totalAmount: totalAmount,
          totalItems: totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map( (orderItem) => ({
                price: products.find( product => product.id === orderItem.productId).price,
                productId: orderItem.productId,
                quantity: orderItem.quantity
              }))
            }
          }
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true
            }
          }
        }
      });

      return {
        ...order,
        OrderItem: order.OrderItem.map( orderItem => ({
          ...orderItem,
          name: products.find( product => product.id === orderItem.productId).name
        }))
      };

    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Check logs'
      });
    }

  }

  async findAll(orderPaginationDto: OrderPaginationDto) {

    const { limit, page, status } = orderPaginationDto;

    const totalPages = await this.order.count({
      where: {
        status: status
      }
    });
    const lastPage = Math.ceil(totalPages / limit);

    const orders = await this.order.findMany({
      where: {
        status: status
      },
      take: limit,
      skip: (page - 1) * limit
    });

    return {
      data: orders,
      meta: {
        page: page,
        totalPages: totalPages,
        lastPage: Math.ceil(totalPages / page)
      }
    }

  }

  async findOne(id: string) {

    const order = await this.order.findFirst({
      where: { id: id },
      include: {
        OrderItem: {
          select: {
            productId: true,
            quantity: true,
            price: true
          }
        }
      }
    });

    if (!order) {
      throw new RpcException({
        message: `Order not found`,
        status: HttpStatus.NOT_FOUND
      });
    }

    const productIds = order.OrderItem.map( orderItem => orderItem.productId );
    const products = await firstValueFrom(
      this.client.send({ cmd: 'validate_products' }, productIds)
    );

    return {
      ...order,
      OrderItem: order.OrderItem.map( orderItem => ({
        name: products.find( product => product.id === orderItem.productId ).name,
        ...orderItem,
      }))
    }

  }

  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {

    const { id, status } = changeOrderStatusDto;

    const order = await this.findOne(id);
    if (order.status == status) {
      return order;
    }

    return this.order.update({
      where: { id },
      data: {
        status: status
      }
    });

  }

}
