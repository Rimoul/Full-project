import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Load the connection string from the .env file
load_dotenv()
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# The engine manages the actual connection to Postgres
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# A SessionLocal is a temporary connection we use per request
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base is the parent class for our database models
Base = declarative_base()

# Dependency to grab a database session for a single request, then close it
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()