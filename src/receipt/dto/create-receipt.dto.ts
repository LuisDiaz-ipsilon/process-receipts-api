
import { IsUUID, IsString, IsNotEmpty } from 'class-validator';

export class CreateReceiptDto {
  idclient: string;

  // imagen en base64 (sin data URL o con ella; lo limpiamos en el servicio)
  @IsString()
  @IsNotEmpty()
  imageBase64: string;
}
