import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { DbService } from 'src/db.service';
import imageSize from 'image-size';
import { runExecutable } from '../utils/run-python.util';
import { ISizeCalculationResult } from 'image-size/types/interface';


/**
 * Obtener el monto de un recibo de transferencia de banco a partir de la imagen.
 * Es necesario que el usuario use una credencial UUID que provee el departamento de ventas.
 * 
 * Pasos:
 * 1 Validar si el cliente existe y longitud de clave.
 * 2 Validar si cliente tiene fichas
 * 3 Restar una ficha al cliente
 * 4 Registrar inicio de transaccion en DB
 * 5 guardar imagen en carpeta de SERVIDOR
 * 6 Guardar registro de imagen sobre DB
 * 7 Ejecutar py de reconocimiento
 * 8 Obtener banco y version de disenio de recibo
 * 9 Ejecutar paso 2 de python lectura de monto
 * 10 Obtener monto del recibo.
 * 11 Registrar fin de transaccion con codigo 00, 02 ...
 * 12 Enviar respuesta
 * 
 * Author: Luis Fernando Flores Diaz
 * Contacto: 81 2727 8053 99diazluisfernand@gmail.com
 */
@Injectable()
export class ReceiptService {
  private readonly uploadDir: string;
  private idNewReceipt: string;
  private bank: string;
  private version: string;
  private monto: string;
  private idReceiptProcess: string;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DbService,
  ) {
    this.uploadDir = this.config.get<string>('UPLOAD_DIR')!;
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  private decodeBase64Image(imageBase64: string): Buffer {
    // soporta "data:image/jpeg;base64,..." y puro base64
    const cleaned = imageBase64.includes('base64,')
      ? imageBase64.split('base64,')[1]
      : imageBase64;
    try {
      return Buffer.from(cleaned, 'base64');
    } catch {
      throw new BadRequestException('Imagen base64 inválida');
    }
  }


  async processReceipt(idClient: string, imageBase64: string) {

    let nowFormatted : string;
    let filename: string ;
    let fullPath : string;
    let buffer: Buffer;

    let stats : fs.Stats;
    let size : Number;                           

    let bufferUnit8 : Buffer;
    let dimensions : ISizeCalculationResult;
    let width : any;
    let height : any;

    let idReceiptInserts: string;

    // Paso 1) validar si cliente existe
    if (idClient.length !== 36){
      throw new BadRequestException('Clave incorrecta');
    }
    const clientRes = await this.db.pool.query(
      'SELECT 1 FROM business_receipts.clients WHERE id_client = $1',
      [idClient],
    );
    if (clientRes.rowCount === 0) {
      throw new BadRequestException('Clave incorrecta');
    }

    // Paso 2 validar si el cliente tiene fichas dispnibles
    const {rows} = await this.db.pool.query<{ coins_available: number | null }>(
      'SELECT coins_available FROM business_receipts.clients_coins WHERE id_client = $1 LIMIT 1',
      [idClient],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Error en servicio, contacte a soporte.'); //cliente no tiene configurada una bolsa de coins
    }
    const coins = Number(rows[0].coins_available);
    if (coins < 1) {
      throw new BadRequestException('Sin fichas disponibles, contacte a ventas al WhatsApp 8127278053 para adquirir más.');
    } else { 
      // Paso 3 Restar una ficha al cliente en caso exitoso. 
      await this.db.pool.query(
        'UPDATE business_receipts.clients_coins '+
        'SET coins_available = coins_available - 1, '+
        'coins_spent = coins_spent + 1 '+
        'WHERE id_client = $1;',
        [idClient],
      );
    };

    //Paso 4 Registrar inicio de transaccion sobre DB.
    try{
      await this.db.pool.query(
        'INSERT INTO business_receipts.transactions '+
        '(id_client) VALUES ($1);',
        [idClient]
      );
    } catch (error: any){
      console.error('Error al registrar el inicio de transaccion en DB:', error, 'Cliente'+idClient);
    }

    //Paso 5 guardar imagen en servidor
    try{
      nowFormatted = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
      filename = `${idClient}_${nowFormatted}.jpg`;
      fullPath = path.join(this.uploadDir, filename);
      buffer = this.decodeBase64Image(imageBase64);
      fs.writeFileSync(fullPath, buffer);
    } catch (error: any){
      console.error('Error al guardar la imagen del cliente: '+idClient+' Error: '+error)
      throw new InternalServerErrorException('Error en servidor contacte a soporte.');
    }

    // Paso 6 Guardar registro de recibo en DB.
    try{
      stats = fs.statSync(fullPath);
      size = Number(stats.size);                              

      bufferUnit8 = fs.readFileSync(fullPath);
      dimensions = imageSize(bufferUnit8); 
      width = dimensions.width ?? 0;
      height = dimensions.height ?? 0;

      idReceiptInserts = `${idClient}-${size}-${width}-${height}`;
    } catch (error: any){
      console.error('Error al obtener los datos de la imagen del cliente: '+idClient+' Error: '+error);
      throw new InternalServerErrorException('Error en servidor contacte a soporte.');
    }

    try{
      const resInsertReceipt = await this.db.pool.query(
        'INSERT INTO process_receipts.receipts ('+
          'id_receipt,'+
          'client,'+
          'name,'+
          'extension,'+
          'route,'+
          'size,'+
          'width,'+
          'height'+
        ')'+
        'VALUES ('+
          'md5($1)::uuid,'+
          '$2,'+
          '$3,'+
          '$4,'+
          '$5,'+
          '$6,'+
          '$7,'+
          '$8'+
        ') RETURNING id_receipt;',
        [idReceiptInserts, idClient, filename, 'jpg', fullPath, size, width, height],
      );

      console.log('Affected rows insert new receipt:', resInsertReceipt.rowCount);
      this.idNewReceipt = resInsertReceipt.rows[0].id_receipt;
    } catch (error: any) {
      if (error.code === '23505') { //duplicate key value violates unique constraint "receipts_pkey"
        try{
          await this.db.pool.query(
            'INSERT INTO business_receipts.transactions '+
            '(id_client, code) VALUES ($1, \'01\');', //00 indica que la imagen ya se proceso antes
            [idClient]
          );
        } catch (error: any){
          console.error('Error al registrar respuesta de transaccion con error en DB.');
        }
        throw new BadRequestException('La imagen ya fue procesada antes.');
        
      } else {
        console.error('Error inesperado al guardar imagen en DB:', error);
        throw new InternalServerErrorException('Error en servidor contacte a soporte.');
      }
    }

    // Paso 7 EJecutar ejecutable de recnocimiento de recibo.
    const stepOne = await runExecutable(process.env.ROUTE_EXECUTABLE_PY_RECOGNIZE_BANK! || '', [
      fullPath,
      this.idNewReceipt,
      this.config.get<string>('DB_HOST')!,
      this.config.get<string>('DB_PORT')!,
      this.config.get<string>('DB_NAME')!,
      this.config.get<string>('DB_USER')!,
      this.config.get<string>('DB_PASS')!
    ]);
    //console.log('Resultado recognizereceipt:', stepOne);

    // Paso 8 Leer resultado: banco y version del recibo.
    try{
      const getBankNVersion = await this.db.pool.query(
        'SELECT bank, version_bank '+
        'FROM process_receipts.receipts_process '+
        'WHERE id_receipt = $1 '+
        'ORDER BY id_receipt_process DESC '+
        'LIMIT 1;',
        [this.idNewReceipt]
      );

      //No se encontro registro de recibo sobre process_receipt al buscar banco y version.
      if (getBankNVersion.rows.length === 0) throw new InternalServerErrorException('Error en servidor contacte a soporte.');

      this.bank = getBankNVersion.rows[0].bank;
      this.version = getBankNVersion.rows[0].version_bank;

    } catch(error: any){
      console.error('Error inesperado al obtener banco y version del recibo:', error);
      throw new InternalServerErrorException('Error en servidor contacte a soporte.');
    }

    //Mejora: hacer que el pyton solo retorne mensajes concisos y leerlos en TS para saber mas rapido que banco y version es, o si no se puede procesar.
    
    // Paso 9 Ejecutar reconocimiento de monto. 
    const stepTwo = await runExecutable(process.env.ROUTE_EXECUTABLE_PY_RECOGNIZE_AMOUNT  || '', [
      fullPath,
      this.bank,
      this.version,
      this.idNewReceipt,
      this.config.get<string>('DB_HOST')!,
      this.config.get<string>('DB_PORT')!,
      this.config.get<string>('DB_NAME')!,
      this.config.get<string>('DB_USER')!,
      this.config.get<string>('DB_PASS')!,
      this.config.get<string>('PATH_PROCESS_IMAGES')!
    ]);
    //console.log('Resultado process_receipt_after_recognize:', stepTwo);

    // Paso 10 obtener el monto del recibo.
    try{
      const getBankNVersion = await this.db.pool.query(
        'SELECT id_receipt_process, mount_process '+
        'FROM process_receipts.receipts_process '+
        'WHERE id_receipt = $1 '+
        'ORDER BY id_receipt_process DESC '+
        'LIMIT 1;',
        [this.idNewReceipt]
      );

      //No se encontro registro de recibo sobre process_receipt al buscar el monto
      if (getBankNVersion.rows.length === 0) throw new InternalServerErrorException('Error en servidor contacte a soporte.');

      this.idReceiptProcess =  getBankNVersion.rows[0].id_receipt_process;
      this.monto = getBankNVersion.rows[0].mount_process;

    } catch(error: any){
      console.error('Error inesperado al obtener monto procesado:', error);
      throw new InternalServerErrorException('Error en servidor contacte a soporte.');
    }
    //Mejora: hacer que el pyton solo retorne mensajes concisos y leerlos en TS para saber mas rapido cual es el monto.

    // Paso 11 Registrar respuesta exitosa.
    try{
      await this.db.pool.query(
        'INSERT INTO business_receipts.transactions '+
        '(id_client, id_receipt_process, code) VALUES ($1, $2, \'00\');', //00 indica transaccion correcta
        [idClient, this.idReceiptProcess]
      );
    } catch (error: any){
      console.error('Error al registrar respuesta de transaccion en DB:', error);
      throw new InternalServerErrorException('Error en servidor contacte a soporte.');
    }

    // Paso 12 retornar json a cliente.
    return { monto: this.monto, file: filename };
  }
}
