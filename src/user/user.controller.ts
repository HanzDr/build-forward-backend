import { Controller, Patch, Headers } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('user')
export class UserController {

    constructor(private readonly userService: UserService){}
    @Patch(':id')

    updateProfile() {
        return this.userService.updateProfile();
    }
}
