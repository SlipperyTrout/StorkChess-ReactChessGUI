import React, { useEffect, useRef } from "react";
import ChessTile from "./DroppableSquare";
import { Position } from "../utils/Position";
import { useState } from "react";
import DraggablePiece from "../pieces/DraggablePiece";
import { PieceType } from "../pieces/PieceType";
import { Piece } from "../pieces/Piece";
import { useParams } from "react-router-dom";
import { getPieceType } from "../pieces/GetPieceType";
import { isPieceMovementLegal } from "../rules/Movement";
import { InCheck } from "../rules/InCheck";
import { isLowerCase } from "../utils/IsLowerCase";
import { isTurn } from "../rules/IsTurn";
import { performCastling } from "../rules/PerformCastling";
import { castlingRightsUpdater } from "../rules/CastlingRightsUpdater";
import PromotionSelection from "./PromotionSelector";
import { getBestMove, startNewGameUCI } from "../../api/UCI";
import { useNavigate } from "react-router-dom";
import { HubConnection, HubConnectionBuilder } from "@microsoft/signalr";

const ChessBoard: React.FC = () => {
  const navigate = useNavigate();
  const [pieces, setPieces] = useState<Piece[]>([]);
  const params = useParams();
  const [isPromotionActive, setIsPromotionActive] = useState(false);

  //multiplayer
  const connectionRef = useRef<HubConnection | null>(null);
  const userRef = useRef<string| null>(null);
  const [messageReccieved, setMessageReccieved] = useState("");
  const [localGame, setlocalGame] = useState(true);
  const [connected, setConnected] = useState(false);
  const [botGameType, setBotGameType] = useState(false)
  const [multiColour, setMultiColour] = useState("");

  useEffect(() => {

    const pieces: Piece[] = [];
    let fenString = params.fen;
    let gameType = params.type;
    let colour = params.colour;
    let gameReady: Promise<Boolean>;

    async function gameStart() {
      if (gameType === "bot") {
        setlocalGame(false)
        setBotGameType(true)
        gameReady = startNewGameUCI();
      } else if (gameType === "multiplayer") {
        //Establish web socket
        setlocalGame(false)
        multiplayer();
      }

      fenString = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      sessionStorage.setItem("turn", "white");
      sessionStorage.setItem("castling", "KQkq");
      sessionStorage.setItem("enpassant", "");
      sessionStorage.setItem("moves", "position startpos ");

      const fenBoardSplit = fenString.split(" ")[0];
      const fenBoard = fenBoardSplit.replace(/\//g, "");

      let i = 0;
      for (let y = 0; y < 8; y++) {
        let counter = 0;
        for (let x = 0; x < 8; x++) {
          if (counter > 0) {
            counter--;
          } else if (!isNaN(Number(fenBoard[i]))) {
            counter = counter + (Number(fenBoard[i]) - 1);
            i++;
          } else {
            const pieceType = getPieceType(fenBoard[i]);
            if (pieceType !== undefined) {
              pieces.push({ type: pieceType, position: { x: x, y: y } });
              i++;
            }
          }
        }
      }

      setPieces(pieces);

      if (gameType === "bot") {
        if ((await gameReady) !== true) {
          alert("Couldnt Start Game");
          navigate("/");
        }

        if (colour) {
          sessionStorage.setItem("botColour", colour);
          if (colour === "white") {
            getBotMove();
          }
        }
      } else {
        sessionStorage.removeItem("botColour");
      }
    }

    gameStart();
  }, []);

  useEffect(() => {
    var positions: Position[] = convertToPosition(messageReccieved);
    if (messageReccieved !== "white" && messageReccieved !== "black") {
      handleDrop(positions[0], positions[1], true);
    } else {
      sessionStorage.setItem("multiColour", messageReccieved);
      setMultiColour(messageReccieved);
    }
  }, [messageReccieved]);

  function multiplayer() {
    const newConnection = new HubConnectionBuilder()
      .withUrl("http://localhost:5247/gameHub")
      .build();

    newConnection
      .start()
      .then(() => {
        connectionRef.current = newConnection;
      })
      .catch(() => {
        alert("Failed to connect")
        navigate('/')
      });
    newConnection.on("Paired", (user) => {
      userRef.current = user;
      setConnected(true);
    });

    newConnection.on("ReceiveMessage", (userId, message) => {
      if(userId) {
        setMessageReccieved(message);
      }
    });

    newConnection.on("PairedUserDisconnected", () => {
      userRef.current = null;
    });

    return () => {
      newConnection.stop().then(() => alert("Connection Connected"));
    };
  }

  async function sendMove() {
    let moves = sessionStorage.getItem("moves");
    if (moves) {
      let movesArray = moves.split(" ");
      let move = movesArray[movesArray.length - 2];
      await connectionRef.current!.send("SendMessage", userRef.current, move)
    }
  }

  //Get move that the bot makes
  async function getBotMove() {
    //Call api
    let moves = sessionStorage.getItem("moves");

    if (moves !== null) {
      var botMove: Promise<string | null> = getBestMove(moves);

      await botMove.then((value) => {
        if (value !== null) {
          var positions: Position[] = convertToPosition(value.split(" ")[1]);

          handleDrop(positions[0], positions[1], true);
        } else {
          alert("somthing went wrong");
        }
      });
    }
  }

  function convertToPosition(move: string): Position[] {
    const letters = ["a", "b", "c", "d", "e", "f", "g", "h"];

    var positionFrom: Position = {
      x: letters.findIndex((x) => x === move[0]),
      y: 8 - Number(move[1]),
    };
    var positionToo: Position = {
      x: letters.findIndex((x) => x === move[2]),
      y: 8 - Number(move[3]),
    };

    var positions: Position[] = [positionFrom, positionToo];
    return positions;
  }

  //Switches between white turn and black turn
  function toggleTurn() {
    let botColour = sessionStorage.getItem("botColour");
    let multiplayerColour = sessionStorage.getItem("multiColour");
    let currentPlayerColor = sessionStorage.getItem("turn");
    if (currentPlayerColor === "white") {
      currentPlayerColor = "black";
      sessionStorage.setItem("turn", "black");
    } else {
      currentPlayerColor = "white";
      sessionStorage.setItem("turn", "white");
    }

    if (botColour) {
      //Checking if its the bots turn
      if (botColour === currentPlayerColor) {
        getBotMove();
      }
    } else if (multiplayerColour) {
      if (multiplayerColour !== currentPlayerColor) {
        sendMove();
      }
    }
  }

  //En passant updater
  function isEnpassantableCheck(fromY: number, toY: number, toX: number) {
    if (Math.abs(fromY - toY) == 2) {
      sessionStorage.setItem("enpassant", `${toX}${toY}`);
    } else {
      sessionStorage.setItem("enpassant", ``);
    }
  }

  const handlePawnPromotion = (piece: string) => {
    setPieces((prevPieces) => {
      const blackPawn = prevPieces.find(
        (piece) => piece.type === PieceType.PawnBlack && piece.position.y === 7
      );

      const whitePawn = prevPieces.find(
        (piece) => piece.type === PieceType.PawnWhite && piece.position.y === 0
      );

      let promotion: PieceType;

      if (whitePawn) {
        switch (piece) {
          case "queen":
            promotion = PieceType.QueenWhite;
            break;
          case "rook":
            promotion = PieceType.RookWhite;
            break;
          case "bishop":
            promotion = PieceType.BishopWhite;
            break;
          case "knight":
            promotion = PieceType.KnightWhite;
            break;
          default:
            return prevPieces;
        }
        let updatedPieces = prevPieces.map((piece) => {
          if (
            piece.position.x === whitePawn.position.x &&
            piece.position.y === whitePawn.position.y
          ) {
            return { ...piece, type: promotion }; // Create a new object with updated position
          }
          return piece;
        });

        sessionStorage.setItem("turn", "black");
        return updatedPieces;
      } else if (blackPawn) {
        switch (piece) {
          case "queen":
            promotion = PieceType.QueenBlack;
            break;
          case "rook":
            promotion = PieceType.RookBlack;
            break;
          case "bishop":
            promotion = PieceType.BishopBlack;
            break;
          case "knight":
            promotion = PieceType.KnightBlack;
            break;
          default:
            return prevPieces;
        }

        let updatedPieces = prevPieces.map((piece) => {
          if (
            piece.position.x === blackPawn.position.x &&
            piece.position.y === blackPawn.position.y
          ) {
            return { ...piece, type: promotion }; // Create a new object with updated position
          }
          return piece;
        });

        sessionStorage.setItem("turn", "white");
        return updatedPieces;
      }

      return prevPieces;
    });

    setIsPromotionActive(false);
  };

  function pawnPromotion() {
    setIsPromotionActive(true);
  }

  function positionsToMove(
    fromPosition: Position,
    toPosition: Position
  ): string {
    const letters = ["a", "b", "c", "d", "e", "f", "g", "h"];

    var move: string = `${letters[fromPosition.x]}${8 - fromPosition.y}${
      letters[toPosition.x]
    }${8 - toPosition.y} `;
    return move;
  }

  // function convertToChessPosition(position: Position): string {
  //     const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  //     const x = position.x;
  //     const y = 7 - position.y; // Invert y-coordinate to match chessboard orientation
  //     const letter = letters[x];
  //     const number = y + 1;

  //Handle drop of pieces
  const handleDrop = async (
    fromPosition: Position,
    toPosition: Position,
    botMove: boolean
  ) => {
    // let localColour = sessionStorage.getItem("multiColour");
    // console.log(fromPosition, toPosition, botMove, localColour)

    // if (localColour === "black" && !botMove) {
    //   fromPosition.y = 7 - fromPosition.y
    //   toPosition.y = 7 - toPosition.y
    // }

    // console.log(fromPosition, toPosition, botMove)
    //On piece move checks for chess rules for legality of the move.
    setPieces((prevPieces) => {
      //Verify that the move is a move not a drop back at the same spot.
      if (fromPosition.x === toPosition.x && fromPosition.y === toPosition.y) {
        return prevPieces;
      }

      //Get piece at location and check if there actually is one
      const pieceFromPosition = prevPieces.find(
        (piece) =>
          piece.position.x === fromPosition.x &&
          piece.position.y === fromPosition.y
      );

      if (!pieceFromPosition) {
        return prevPieces;
      }

      //Check if it is the turn of the piece colour moved
      if (!isTurn(pieceFromPosition, botMove)) {
        return prevPieces;
      }

      //Get castling string then see if the move performed was an attempted castle
      let castling = sessionStorage.getItem("castling");
      if (
        castling &&
        castling.length > 0 &&
        (pieceFromPosition.type === PieceType.KingBlack ||
          pieceFromPosition.type === PieceType.KingWhite)
      ) {
        const castlingResult = performCastling(
          castling,
          pieceFromPosition,
          toPosition,
          fromPosition,
          prevPieces
        );
        if (castlingResult) {
          toggleTurn();
          return castlingResult;
        }
      }

      //Check if the move attempted to be performed is a legal move.
      if (
        !isPieceMovementLegal(
          pieceFromPosition,
          fromPosition,
          toPosition,
          prevPieces
        )
      ) {
        return prevPieces;
      }

      // Create a new array with updated positions
      let updatedPieces = prevPieces.map((piece) => {
        if (
          piece.position.x === fromPosition.x &&
          piece.position.y === fromPosition.y
        ) {
          return { ...piece, position: { ...toPosition } }; // Create a new object with updated position
        }
        return piece;
      });

      //Check if there is a piece at the position that was attempted to be moved to.
      const pieceAtPosition = prevPieces.find(
        (piece) =>
          piece.position.x === toPosition.x && piece.position.y === toPosition.y
      );

      const enpassant = sessionStorage.getItem("enpassant");
      // Checks if there is a piece at the location and filter it out if captured - if not checks if the piece was an enpassant move
      if (pieceAtPosition && pieceFromPosition) {
        //Check youre not capturing a piece of the same colour
        if (
          isLowerCase(pieceAtPosition.type) !==
          isLowerCase(pieceFromPosition.type)
        ) {
          updatedPieces = updatedPieces.filter(
            (obj) => obj.position !== pieceAtPosition.position
          );
        } else {
          return prevPieces;
        }
      } else if (
        !pieceAtPosition &&
        pieceFromPosition &&
        enpassant &&
        enpassant.length > 0
      ) {
        const x: number = parseInt(enpassant[0]);
        const y: number = parseInt(enpassant[1]);
        if (
          (x === toPosition.x &&
            pieceFromPosition.type === PieceType.PawnBlack &&
            y === toPosition.y - 1) ||
          (pieceFromPosition.type === PieceType.PawnWhite &&
            y === toPosition.y + 1)
        ) {
          updatedPieces = updatedPieces.filter(
            (obj) => !(obj.position.x === x && obj.position.y === y)
          );
        }
      }

      if (InCheck(pieceFromPosition.type, updatedPieces)) {
        return prevPieces;
      }

      //Check if its castling and then perform
      if (castling) {
        castlingRightsUpdater(pieceFromPosition, castling, fromPosition);
      }

      //Check if it is Enpassant and then perform move
      if (
        pieceFromPosition.type == PieceType.PawnBlack ||
        PieceType.PawnWhite
      ) {
        isEnpassantableCheck(fromPosition.y, toPosition.y, toPosition.x);
      } else {
        sessionStorage.setItem("enpassant", ``);
      }

      //Made for pawn promotion
      if (
        pieceFromPosition.type === PieceType.PawnWhite &&
        toPosition.y === 0
      ) {
        //Promote White
        pawnPromotion();
      } else if (
        pieceFromPosition.type === PieceType.PawnBlack &&
        toPosition.y === 7
      ) {
        //Promote Black
        pawnPromotion();
      } else {
        //convert to a move and store in the string
        let moves = sessionStorage.getItem("moves");

        if (moves) {
          moves = `${moves}${positionsToMove(fromPosition, toPosition)}`;
          sessionStorage.setItem("moves", moves);
        }

        toggleTurn();
      }

      return updatedPieces;
    });
  };

  //Render chess tile with/without piece
  const renderTile = (
    position: Position,
    postionName: string,
    color: "white" | "black"
  ) => {
    const piece = pieces.find(
      (piece) =>
        piece.position.x === position.x && piece.position.y === position.y
    );
    return (
      <ChessTile
        position={position}
        positionName={postionName}
        color={color}
        onDrop={handleDrop}
      >
        {piece && (
          <DraggablePiece type={piece.type} position={piece.position} />
        )}
      </ChessTile>
    );
  };

  //Render chess board
  const renderBoard = () => {
    const tiles = [];
    // if (multiColour === "black") {
    //   for (let y = 0; y < 8; y++) {
    //     for (let x = 0; x < 8; x++) {
    //       // Calculate the flipped row index
    //       const flippedY = 7 - y;
    //       const position = { x, y: flippedY };
    //       const positionName = String.fromCharCode(97 + x) + (flippedY + 1).toString();
    //       const color = (flippedY + x) % 2 !== 0 ? "black" : "white";
    //       tiles.push(renderTile(position, positionName, color));
    //     }
    //   }
    //   return tiles;
    //}
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const position = { x, y };
        const postionName = String.fromCharCode(97 + x) + (8 - y).toString();
        const color = (y + x) % 2 !== 0 ? "black" : "white";
        tiles.push(renderTile(position, postionName, color));
      }
    }
    return tiles;
  };
  

  const movesPlayed = () => {
    const moves = sessionStorage.getItem("moves");
    const movesArray = moves?.split(" ");
    movesArray?.pop()
    return (
      <>
      <p className="moveColumn">White</p>
      <p className="moveColumn">Black</p>
        {movesArray?.slice(2).map((move: string, index: number) => (
          <p className="moveColumn" key={index}>{move}</p>
        ))}
      </>
    );
  };

  const currentTurn = () => {
    const turn = sessionStorage.getItem("turn");
    const botGame = sessionStorage.getItem("botColour");
    const multiGame = sessionStorage.getItem("multiColour");
    if (turn) {
      return (
        <>
          {botGame && botGame !== turn && botGameType && <h2>Your turn, {turn} to play</h2>}
          {botGame && botGame === turn && botGameType && <h2>Bot is currently thinking...</h2>}
          {!connected && !localGame && !botGameType && <h2>Waiting to connect you to an oponent.</h2>}
          {connected && multiColour === turn && !botGameType && <h2>Your turn, {multiGame} to move.</h2>}
          {connected && multiColour !== turn && !botGameType && <h2>Oponents turn.</h2>}
          {localGame && <h2>Current Turn: {turn!.charAt(0).toUpperCase() + turn!.slice(1)}</h2>}
        </>
      );
    }
  };

  function abortGame() {
    sessionStorage.clear()
    navigate('/')
  }

  return (
    <div className="game-screen">
      <div className="playingfield">
        <div className="chessboard">
          {renderBoard()}
          {isPromotionActive && (
            <PromotionSelection onSelectPiece={handlePawnPromotion} />
          )}
        </div>
        <div className="turn">{currentTurn()}</div>
      </div>
      <div className="moves">
        <h1> Moves Played </h1>
        <button onClick={abortGame}>Abort Game</button>
        <div className="move-container">  {movesPlayed()}</div>
      </div>
    </div>
  );
};

export default ChessBoard;
