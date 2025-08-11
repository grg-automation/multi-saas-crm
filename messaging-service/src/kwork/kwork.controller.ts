import { Body, Controller, Get, Logger, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import axios from 'axios';

@Controller('api/v1/kwork')
export class KworkController {
  private readonly logger = new Logger(KworkController.name);
  private readonly kworkServiceUrl = process.env.KWORK_SERVICE_URL || 'http://localhost:8000';

  @Post('download-file')
  async downloadFile(@Body() body: { messageId: string; orderId: string }) {
    this.logger.log(`📥 Proxying download file request for message: ${body.messageId}`);
    
    try {
      const response = await axios.post(`${this.kworkServiceUrl}/download-file`, body);
      return response.data;
    } catch (error) {
      this.logger.error(`❌ Error downloading Kwork file:`, error.message);
      throw error;
    }
  }

  @Post('send-message')
  async sendMessage(@Body() body: { orderId: string; message: string; managerId?: string }) {
    this.logger.log(`📤 Proxying send message request for order: ${body.orderId}`);
    
    try {
      const response = await axios.post(`${this.kworkServiceUrl}/send-message`, body);
      return response.data;
    } catch (error) {
      this.logger.error(`❌ Error sending Kwork message:`, error.message);
      throw error;
    }
  }

  @Post('send-file')
  @UseInterceptors(FileInterceptor('file'))
  async sendFile(
    @UploadedFile() file: any,
    @Body() body: { orderId: string; description?: string; managerId?: string }
  ) {
    this.logger.log(`📎 Proxying send file request for order: ${body.orderId}`);
    
    try {
      const formData = new FormData();
      formData.append('file', new Blob([file.buffer]), file.originalname);
      formData.append('orderId', body.orderId);
      if (body.description) formData.append('description', body.description);
      if (body.managerId) formData.append('managerId', body.managerId);

      const response = await axios.post(`${this.kworkServiceUrl}/send-file`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      return response.data;
    } catch (error) {
      this.logger.error(`❌ Error sending Kwork file:`, error.message);
      throw error;
    }
  }

  @Get('orders')
  async getOrders(@Query('status') status?: string, @Query('limit') limit: string = '50') {
    this.logger.log(`📋 Proxying get orders request with status: ${status}`);
    
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      params.append('limit', limit);

      const response = await axios.get(`${this.kworkServiceUrl}/orders?${params}`);
      return response.data;
    } catch (error) {
      this.logger.error(`❌ Error fetching Kwork orders:`, error.message);
      throw error;
    }
  }

  @Post('send-response')
  async sendResponse(@Body() body: {
    orderId: string;
    text: string;
    price: number;
    deliveryTime: number;
    managerId?: string;
  }) {
    this.logger.log(`💼 Proxying send response request for order: ${body.orderId}`);
    
    try {
      const response = await axios.post(`${this.kworkServiceUrl}/send-response`, body);
      return response.data;
    } catch (error) {
      this.logger.error(`❌ Error sending Kwork response:`, error.message);
      throw error;
    }
  }
}