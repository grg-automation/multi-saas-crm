import { Body, Controller, Logger, Post, Param } from '@nestjs/common';
import { MessageService } from '../../message/message.service';
import { KworkMessageData } from '../../message/adapters/kwork-message.adapter';

@Controller('webhooks/kwork')
export class KworkWebhookController {
  private readonly logger = new Logger(KworkWebhookController.name);

  constructor(private readonly messageService: MessageService) {}

  @Post('message')
  async handleKworkMessage(@Body() messageData: KworkMessageData) {
    this.logger.log(`📨 Received Kwork message webhook: ${messageData.id}`);
    
    try {
      // Process the Kwork message through the message service
      await this.messageService.processKworkMessage(messageData, null);
      
      this.logger.log(`✅ Processed Kwork message: ${messageData.id}`);
      return { status: 'OK', message: 'Message processed successfully' };
    } catch (error) {
      this.logger.error(`❌ Error processing Kwork message ${messageData.id}:`, error.message);
      return { 
        status: 'ERROR', 
        message: 'Failed to process message',
        error: error.message 
      };
    }
  }

  @Post('order/:orderId/update')
  async handleKworkOrderUpdate(
    @Param('orderId') orderId: string,
    @Body() updateData: any
  ) {
    this.logger.log(`📋 Received Kwork order update: ${orderId}`);
    
    try {
      // Handle order status updates (for CRM sync)
      this.logger.log(`Kwork order ${orderId} status updated:`, updateData);
      
      // TODO: Implement order status sync with CRM
      // This would call the CRM integration to update opportunity status
      
      return { status: 'OK', message: 'Order update processed' };
    } catch (error) {
      this.logger.error(`❌ Error processing Kwork order update ${orderId}:`, error.message);
      return { 
        status: 'ERROR', 
        message: 'Failed to process order update',
        error: error.message 
      };
    }
  }

  @Post('chat/:dialogId/messages')
  async handleKworkChatMessages(
    @Param('dialogId') dialogId: string,
    @Body() messagesData: { messages: KworkMessageData[] }
  ) {
    this.logger.log(`💬 Received Kwork chat messages for dialog: ${dialogId}`);
    
    try {
      const results: Array<{ messageId: string; status: string; error?: string }> = [];
      
      for (const messageData of messagesData.messages) {
        try {
          await this.messageService.processKworkMessage(messageData, null);
          results.push({ messageId: messageData.id, status: 'success' });
        } catch (error) {
          this.logger.error(`Error processing message ${messageData.id}:`, error.message);
          results.push({ messageId: messageData.id, status: 'error', error: error.message });
        }
      }
      
      const successCount = results.filter(r => r.status === 'success').length;
      this.logger.log(`✅ Processed ${successCount}/${results.length} Kwork chat messages`);
      
      return { 
        status: 'OK', 
        processed: successCount,
        total: results.length,
        results 
      };
    } catch (error) {
      this.logger.error(`❌ Error processing Kwork chat messages for ${dialogId}:`, error.message);
      return { 
        status: 'ERROR', 
        message: 'Failed to process chat messages',
        error: error.message 
      };
    }
  }
}