import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { MatchupSummary } from './types.js';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function putMatchupSummary(tableName: string, summary: MatchupSummary): Promise<void> {
    await ddb.send(new PutCommand({
        TableName: tableName,
        Item: summary,
    }));
}
