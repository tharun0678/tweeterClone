const express = require("express");
const app = express();
app.use(express.json());
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const intializeAndConnectDb = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3001, () => {
      console.log(`Server is running at http://localhost:3000`);
    });
  } catch (e) {
    console.log(`Db Error: ${e.message}`);
    process.exit(-1);
  }
};

intializeAndConnectDb();

const verify = (request, response, next) => {
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    const jwtToken = authHeaders.split(" ")[1];
    if (jwtToken !== undefined) {
      jwt.verify(jwtToken, "secret", (error, payload) => {
        if (error) {
          response.status(401);
          response.send(`Invalid JWT Token`);
        } else {
          request.userId = payload.userId;
          next();
        }
      });
    } else {
      response.status(401);
      response.send(`Invalid JWT Token`);
    }
  } else {
    response.status(401);
    response.send(`Invalid JWT Token`);
  }
};

//API-1 ADDING NEW USER
app.post("/register/", async (request, response) => {
  const userDetails = request.body;
  const { username, password, name, gender } = userDetails;
  const checkUserExistOrNot = `select * from user where username = '${username}';`;
  const getUserDetails = await db.get(checkUserExistOrNot);
  if (getUserDetails === undefined) {
    const verifyPassword = password.length;
    if (verifyPassword < 6) {
      response.status(400);
      response.send(`Password is too short`);
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const registerNewUser = `
          insert into user(username,password,name, gender) values(
            '${username}',
            '${hashedPassword}',
            '${name}',
            '${gender}'
          )`;
      await db.run(registerNewUser);
      response.status(200);
      response.send(`User created successfully`);
    }
  } else {
    response.status(400);
    response.send(`User already exists`);
  }
});

//API-2 LOGIN
app.post("/login/", async (request, response) => {
  const userDetails = request.body;
  const { username, password } = userDetails;
  const checkUserValidOrNot = `
    select * from user where username='${username}';`;

  const validUser = await db.get(checkUserValidOrNot);
  if (validUser === undefined) {
    response.status(400);
    response.send(`Invalid user`);
  } else {
    const checkValidPassword = await bcrypt.compare(
      password,
      validUser.password
    );
    if (checkValidPassword === true) {
      const payload = { userId: validUser.user_id };
      const jwtToken = jwt.sign(payload, "secret");
      response.status(200);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send(`Invalid password`);
    }
  }
});

//API - 3 GET tweets
app.get("/user/tweets/feed/", verify, async (request, response) => {
  const { userId } = request;
  const getTweets = `
    select user.username as username, tweet.tweet as tweet, tweet.date_time as dateTime from user
    inner join tweet 
    on user.user_id = tweet.user_id 
    where tweet.user_id in (select following_user_id from follower
        where follower_user_id = ${userId}) order by date_time limit 4`;
  const tweets = await db.all(getTweets);
  response.status(200);
  response.send(tweets);
});

//API - 4 List of names following by user
app.get("/user/following/", verify, async (request, response) => {
  const { userId } = request;
  const userFollowing = `
    select distinct user.username as name from user 
    inner join follower 
    on user.user_id = follower.following_user_id
    where following_user_id in (select following_user_id from follower
        where follower_user_id = ${userId})`;
  const following = await db.all(userFollowing);
  response.status(200);
  response.send(following);
});

//API - 5 List of names following user
app.get("/user/followers/", verify, async (request, response) => {
  const { userId } = request;
  const getAllFollowers = `
    select distinct user.username as name from user 
    inner join follower
    on user.user_id = follower.follower_user_id 
    where follower.follower_user_id in (
        select follower_user_id from follower where following_user_id = ${userId}
    )`;
  const followers = await db.all(getAllFollowers);
  response.send(followers);
});

function likesAndReplies(object1, object2) {
  return {
    tweet: object1.tweet,
    likes: object2.likes,
    replies: object1.replies,
    dateTime: object1.dateTime,
  };
}

//API - 6 count of tweets following by user
app.get("/tweets/:tweetId/", verify, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request;
  const tweetedPersonId = `select user_id from tweet where tweet_id = ${tweetId}`;
  const tweetedPerson = await db.get(tweetedPersonId);

  const checkFollowing = `select * from follower where follower_user_id = ${userId} and following_user_id = ${tweetedPerson.user_id}`;
  const result = await db.get(checkFollowing);
  if (result !== undefined) {
    const stats = `select  tweet.tweet as tweet, count(reply.tweet_id) as replies,  
    tweet.date_time as dateTime from tweet 
    inner join reply
    on tweet.tweet_id = reply.tweet_id
    where reply.tweet_id = ${tweetId}`;
    const result1 = await db.get(stats);
    const stats1 = `select  count(like.tweet_id) as likes from like 
    inner join tweet
    on like.tweet_id = tweet.tweet_id
    where like.tweet_id = ${tweetId}`;
    const result2 = await db.get(stats1);
    const total = likesAndReplies(result1, result2);
    response.send(total);
  } else {
    response.status(401);
    response.send(`Invalid Request`);
  }
});

function likes(listOfNames) {
  const like = [...listOfNames];
  return {
    likes: like,
  };
}
//API - 7
app.get("/tweets/:tweetId/likes/", verify, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request;
  const tweetedPersonId = `select user_id from tweet where tweet_id = ${tweetId}`;
  const tweetedPerson = await db.get(tweetedPersonId);

  const checkFollowing = `select * from follower where follower_user_id = ${userId} and following_user_id = ${tweetedPerson.user_id}`;
  const result = await db.get(checkFollowing);
  if (result !== undefined) {
    const names = `select user.username as name from user 
      where user_id in (select user_id from like where tweet_id = ${tweetId})`;

    const likedNames = await db.all(names);
    let listOfNames = [];
    likedNames.map((eachName) => {
      listOfNames.push(eachName.name);
    });
    const result1 = likes(listOfNames);
    response.send(result1);
  } else {
    response.status(401);
    response.send(`Invalid Request`);
  }
});

function replyNames(listOfNames) {
  const result = [...listOfNames];
  return {
    replies: result,
  };
}

//API - 8
app.get("/tweets/:tweetId/replies/", verify, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request;
  const tweetedPersonId = `select user_id from tweet where tweet_id = ${tweetId}`;
  const tweetedPerson = await db.get(tweetedPersonId);

  const checkFollowing = `select * from follower where follower_user_id = ${userId} and following_user_id = ${tweetedPerson.user_id}`;
  const result = await db.get(checkFollowing);
  if (result !== undefined) {
    const names = `select  user.username as name, reply.reply as reply  from reply
    inner join user 
    on reply.user_id = user.user_id 
    where tweet_id = ${tweetId}`;
    const replies = await db.all(names);
    const listOfReplies = replyNames(replies);
    response.send(listOfReplies);
  } else {
    response.status(401);
    response.send(`Invalid Request`);
  }
});

function tweetsOfUser(likes, reply) {
  const listOfTweets = [];
  count = 0;
  for (let tweet of likes) {
    let result = {
      tweet: tweet.tweet,
      likes: tweet.likes,
      replies: reply[count].replies,
      dateTime: tweet.dateTime,
    };
    count += 1;
    listOfTweets.push(result);
  }
  return listOfTweets;
}

//API - 9
app.get("/user/tweets/", verify, async (request, response) => {
  const { userId } = request;
  const countOflikes = `
    select  count(like.tweet_id) as likes, 
    tweet.tweet as tweet, tweet.date_time as dateTime from tweet
    join like
    on tweet.tweet_id = like.tweet_id
    where tweet.user_id = ${userId}
    group by tweet.tweet_id`;
  const tweets = await db.all(countOflikes);
  const countOfReplies = `
    select  count(reply.tweet_id) as replies from tweet
    inner join reply
    on tweet.tweet_id = reply.tweet_id
    where tweet.user_id = ${userId}
    group by tweet.tweet_id`;
  const replies = await db.all(countOfReplies);
  const result = tweetsOfUser(tweets, replies);
  response.send(result);
});

//API - 10
app.post("/user/tweets/", verify, async (request, response) => {
  const { userId } = request;
  const { tweet } = request.body;
  const date = new Date();
  console.log(date);
  const postTweet = `
    insert into tweet(tweet, user_id, date_time) values(
        '${tweet}',
        ${userId},
        '${date}'
    );`;
  await db.run(postTweet);
  response.send(`Created a Tweet`);
});

//API - 11
app.delete("/tweets/:tweetId/", verify, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request;
  console.log(userId);

  const tweet = `
    select * from tweet where user_id = ${userId} and tweet_id = ${tweetId}`;
  const checkTweet = await db.get(tweet);
  if (checkTweet !== undefined) {
    const delTweet = `
      delete from tweet where tweet_id = ${tweetId}`;
    const del = await db.run(delTweet);
    response.send(`Tweet Removed`);
  } else {
    response.status(401);
    response.send(`Invalid Request`);
  }
});
module.exports = app;
