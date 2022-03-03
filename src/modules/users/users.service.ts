import * as bcrypt from 'bcrypt'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { USER_NOT_FOUND } from 'src/core/constants'
import { RegisterDto } from '../users/dto/register.dto'
import { User, UserDocument } from 'src/modules/users/schemas/user.schema'
import { FetchDto } from 'src/pagination/dto/fetch.dto'
import { PaginationService } from 'src/pagination/pagination.service'

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  private async hashPassword(password) {
    const hash = await bcrypt.hash(password, 10)
    return hash
  }

  async register(registerDto: RegisterDto): Promise<any> {
    registerDto.password = await this.hashPassword(registerDto.password)
    const user = new this.userModel(registerDto)

    try {
      await user.save()

      delete user['_doc'].password
      return user['_doc']
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException({
          statusCode: 409,
          errorFields: error.keyValue,
          error: 'Conflict',
        })
      }

      if (error?.name === 'ValidationError') {
        const formattedError = {
          statusCode: 400,
          message: error?.message,
          error: 'Bad Request',
          errorFields: {},
        }

        Object.keys(error?.errors).some((i) => {
          formattedError.errorFields[i] = {
            ...error?.errors[i].properties,
          }
        })
        throw new BadRequestException(formattedError)
      }
      throw error
    }
  }

  async findByEmailOrPhoneNumber(userCredential: string): Promise<User> {
    const user = await this.userModel.findOne({
      $or: [{ email: userCredential }, { phone: userCredential }],
    })

    if (!user) {
      throw new NotFoundException(USER_NOT_FOUND)
    }

    return user
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.userModel.findOne({
      id: userId,
    })

    if (!user) {
      throw new NotFoundException(USER_NOT_FOUND)
    } else {
      delete user['_doc'].password
      return user['_doc']
    }
  }

  //admin

  async paginated(fetchDto: FetchDto, res: any) {
    try {
      let query = {}
      if (fetchDto?.search) {
        query = {
          $text: { $search: fetchDto.search },
        }
      }

      const result = await this.paginationService.paginate(
        this.userModel,
        { ...query },
        {
          ...fetchDto,
        },
        res,
      )

      return result
    } catch (error) {
      throw new UnprocessableEntityException(error.message)
    }
  }
}
