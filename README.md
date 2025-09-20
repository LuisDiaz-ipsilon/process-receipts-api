@Author Luis Diaz  
Build 1.0 20-09-2025 01:40 HRS  

<p align="center">
  <a href="https://softwarefabrik.com.mx/" target="blank"><img src="public/images/logo-white.svg" width="480" alt="softwarefabrik Logo" /></a>
</p>



  <p align="center">Envia una captura de pantalla del comprobante y recibe el monto. Pruebala en <a href="https://recognize-receipts.softwarefabrik.com.mx/" target="_blank">Api</a>.</p>
    <p align="center">

## Tecnical Description

Solo los clientes previamente registrados pueden transaccionar en la API.  
Actualmente en la web se usa un id de cliente especifico y oculto.
Es necesario que un nuevo cliente contacte a Softwarefabrik para generar una id client y usarlo en la peticion de reconocer comprobante.
Actulmente solo se tiene un end point publicado que es <span style="color:orange; font-weight:bold">/process</span>.

A continuacion se describira el proceso que pasa detras del metodo, asi como lo requerido para efectuarse y la arquitectura completa del desarollo.

### Arquitectura

NestJs ^ Python ^ PostgreSQL ^ Linux

#### Base de datos

Se tienen dos esquemas sobre base de datos 
 - `business_receipts`
 - `process_receipts`

En el `business_receipts` se lleva el registro de clientes, las recargas de monedas/coins(intentos), transacciones que realizan (transaccion : 1 intento de reconocer imagen).

Es necesario que el cliente tenga monedas disponibles para transaccionar.  
Se recarga a un cliente manualmente por query sobre base de datos.  
Se genera a un nuevo cliente manualmente por query sobre base de datos.  
En la tabla transacciones el sistema NestJs escribe los intentos de reconocer la imagen y su respuesta.  
Este esquema solo lo toca el backend con procesos automatizados o manualmente.  

En process_receipts se encuentran los registros de las imagenes recibidas para procesar y el resultado del procesamiento de la imagen, se describe el banco, version y monto, ademas de las caracteristicas de la imagen, se diferencia cada imagen por un conjunto de datos:`<idClient>-<size>-<width>-<height>`, (ignorando los diamantes) se hashea con md5 y se convierte en un UUID, si se ingresan los mismos valores se generara el mismo uuid.

#### Servicio

Esta desarrollado en NestJS y Python, el serivcio solo tiene un metodo publico, es /process, este metodo recibe un id de cliente y una imagen en base 64, (consultar los recibos aceptados), se valida si el cliente existe, si tiene monedas, si es asi resta una de la cuenta del cliente y comienza registrando la transaccion sobre base de datos, guardando la imagen en el servidor con un titulo propio similar a: '1c06df3b-3eae-4bbf-9ea3-aa2b216b5d30_20250918045443.jpg' donde es el id de cliente y a la fecha actual a nivel segundo, el reconocimiento consta de dos pasos:

- Step 1 Py: `recognizereceipt`
- Step 2 Py: `process_receipt_after_recognize`

Ambos son scripts compilados en python para reconocer la imagen en cuanto a banco y version de comprobante emitido por el banco, la version corresponde a tonalidades de color en la imagen, por ejemplo, si es BBVA version 1 en el archivo de documentacion se especifica que es la version usada por la aplicacion BBVA en el año 2024 en tono oscuro.  
El segundo paso lee en base de datos el banco y version especificado para aplicar un algoritmo de procesamiento visual que recorta y delimita la zona donde se aplicara el OCR para reconocer el monto, por ultimo lo registra en la base de datos.  
Ambos scripts escriben su resultado en la base de datos pero en el procesamiento para ahorrar tiempo devuelven un texto que es el print de consola de python que contiene en un formato los mismos datos escritos en base de datos; Ejemplo: 

- <span style="color:red; font-weight:bold">RESULT::BBVA,2::END</span> (Especifica el banco y el numero de version separado por comas).  
- <span style="color:red; font-weight:bold">AMOUNT::99,415.00::END</span> (Especifica el id de procesamiento en DB y el monto del comprobante).

De esta manera se acelera la respuesta al cliente.

Al finalzar se escirbre la respuesta de la transaccion un un codigo de 2 digitos:

- 00: Reconocimiento exitoso.  
- 01: Imagen duplicada.


#### Servidor

Se implementa Ubuntu 22, se utiliza pm2 en la Gestión de Servicios. Se instalo Tesseract OCR, OpenCV y Python.  
Para el manejo de Archivos se usan rutas organizadas para procesamiento:  
- /images-process → imágenes recibidas.  
- /images-post-process → imágenes procesadas.


## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
