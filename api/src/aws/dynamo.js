import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = process.env.DYNAMODB_LIKES_TABLE;

export async function addLike(postId, userId) {
  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: { post_id: String(postId), user_id: userId },
    })
  );
}

export async function getLikeCount(postId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'post_id = :postId',
      ExpressionAttributeValues: { ':postId': String(postId) },
      Select: 'COUNT',
    })
  );
  return result.Count ?? 0;
}
