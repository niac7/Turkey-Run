
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text3D, Center } from '@react-three/drei';
import { v4 as uuidv4 } from 'uuid';
import { useStore, TARGET_WORD } from '../../store';
import { GameObject, ObjectType, LANE_WIDTH, SPAWN_DISTANCE, REMOVE_DISTANCE, GameStatus, THEME_COLORS } from '../../types';
import { audio } from '../System/Audio';

// --- GEOMETRIES ---

// Hay Bale (Obstacle)
const HAY_GEO = new THREE.BoxGeometry(1.8, 1.4, 1.4);

// Pumpkin Pie (Gem) - Orange Cylinder
const PIE_GEO = new THREE.CylinderGeometry(0.4, 0.3, 0.2, 12);
const PIE_CRUST_GEO = new THREE.CylinderGeometry(0.42, 0.32, 0.1, 12);

// Scarecrow (Alien)
const SCARECROW_POLE = new THREE.CylinderGeometry(0.05, 0.05, 2);
const SCARECROW_ARM = new THREE.CylinderGeometry(0.05, 0.05, 1.5);
const SCARECROW_HEAD = new THREE.SphereGeometry(0.25);
const SCARECROW_BODY = new THREE.CylinderGeometry(0.2, 0.25, 0.8);

// Pitchfork (Missile)
const FORK_HANDLE = new THREE.CylinderGeometry(0.03, 0.03, 2.5);
const FORK_HEAD = new THREE.BoxGeometry(0.4, 0.4, 0.05);

// Shadows
const SHADOW_DEFAULT_GEO = new THREE.CircleGeometry(0.8, 8);
const SHOP_FRAME_GEO = new THREE.BoxGeometry(1, 7, 1); 
const SHOP_BACK_GEO = new THREE.BoxGeometry(1, 5, 1.2);

const PARTICLE_COUNT = 400;
const BASE_LETTER_INTERVAL = 150; 

const getLetterInterval = (level: number) => {
    return BASE_LETTER_INTERVAL * Math.pow(1.5, Math.max(0, level - 1));
};

const MISSILE_SPEED = 20; 
const FONT_URL = "https://cdn.jsdelivr.net/npm/three/examples/fonts/helvetiker_bold.typeface.json";

// --- Particle System (Leaves/Crumbs) ---
const ParticleSystem: React.FC = () => {
    const mesh = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    
    const particles = useMemo(() => new Array(PARTICLE_COUNT).fill(0).map(() => ({
        life: 0,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        color: new THREE.Color()
    })), []);

    useEffect(() => {
        const handleExplosion = (e: CustomEvent) => {
            const { position, color } = e.detail;
            let spawned = 0;
            const burstAmount = 30; 

            for(let i = 0; i < PARTICLE_COUNT; i++) {
                const p = particles[i];
                if (p.life <= 0) {
                    p.life = 1.0 + Math.random() * 0.5; 
                    p.pos.set(position[0], position[1], position[2]);
                    p.vel.set(
                        (Math.random() - 0.5) * 5,
                        Math.random() * 5,
                        (Math.random() - 0.5) * 5
                    );
                    p.rot.set(Math.random(), Math.random(), Math.random());
                    p.color.set(color);
                    spawned++;
                    if (spawned >= burstAmount) break;
                }
            }
        };
        window.addEventListener('particle-burst', handleExplosion as any);
        return () => window.removeEventListener('particle-burst', handleExplosion as any);
    }, [particles]);

    useFrame((state, delta) => {
        if (!mesh.current) return;
        const safeDelta = Math.min(delta, 0.1);
        particles.forEach((p, i) => {
            if (p.life > 0) {
                p.life -= safeDelta;
                p.pos.addScaledVector(p.vel, safeDelta);
                p.vel.y -= safeDelta * 9.8; // Gravity
                dummy.position.copy(p.pos);
                dummy.scale.setScalar(p.life * 0.3);
                dummy.rotation.x += p.life;
                dummy.updateMatrix();
                mesh.current!.setMatrixAt(i, dummy.matrix);
                mesh.current!.setColorAt(i, p.color);
            } else {
                dummy.scale.set(0,0,0);
                dummy.updateMatrix();
                mesh.current!.setMatrixAt(i, dummy.matrix);
            }
        });
        mesh.current.instanceMatrix.needsUpdate = true;
        if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={mesh} args={[undefined, undefined, PARTICLE_COUNT]}>
            <boxGeometry args={[0.3, 0.3, 0.05]} />
            <meshStandardMaterial color="#d2691e" />
        </instancedMesh>
    );
};


const getRandomLane = (laneCount: number) => {
    const max = Math.floor(laneCount / 2);
    return Math.floor(Math.random() * (max * 2 + 1)) - max;
};

export const LevelManager: React.FC = () => {
  const { 
    status, 
    speed, 
    collectGem, 
    collectLetter, 
    collectedLetters,
    laneCount,
    setDistance,
    openShop,
    level
  } = useStore();
  
  const objectsRef = useRef<GameObject[]>([]);
  const [renderTrigger, setRenderTrigger] = useState(0);
  const prevStatus = useRef(status);
  const prevLevel = useRef(level);

  const playerObjRef = useRef<THREE.Object3D | null>(null);
  const distanceTraveled = useRef(0);
  const nextLetterDistance = useRef(BASE_LETTER_INTERVAL);

  useEffect(() => {
    const isRestart = status === GameStatus.PLAYING && prevStatus.current === GameStatus.GAME_OVER;
    const isMenuReset = status === GameStatus.MENU;
    const isLevelUp = level !== prevLevel.current && status === GameStatus.PLAYING;
    const isVictoryReset = status === GameStatus.PLAYING && prevStatus.current === GameStatus.VICTORY;

    if (isMenuReset || isRestart || isVictoryReset) {
        objectsRef.current = [];
        setRenderTrigger(t => t + 1);
        distanceTraveled.current = 0;
        nextLetterDistance.current = getLetterInterval(1);

    } else if (isLevelUp && level > 1) {
        objectsRef.current = objectsRef.current.filter(obj => obj.position[2] > -80);
        objectsRef.current.push({
            id: uuidv4(),
            type: ObjectType.SHOP_PORTAL,
            position: [0, 0, -100], 
            active: true,
        });
        nextLetterDistance.current = distanceTraveled.current - SPAWN_DISTANCE + getLetterInterval(level);
        setRenderTrigger(t => t + 1);
    } else if (status === GameStatus.GAME_OVER || status === GameStatus.VICTORY) {
        setDistance(Math.floor(distanceTraveled.current));
    }
    prevStatus.current = status;
    prevLevel.current = level;
  }, [status, level, setDistance]);

  useFrame((state) => {
      if (!playerObjRef.current) {
          const group = state.scene.getObjectByName('PlayerGroup');
          if (group && group.children.length > 0) {
              playerObjRef.current = group.children[0];
          }
      }
  });

  useFrame((state, delta) => {
    if (status !== GameStatus.PLAYING) return;
    const safeDelta = Math.min(delta, 0.05); 
    const dist = speed * safeDelta;
    distanceTraveled.current += dist;

    let hasChanges = false;
    let playerPos = new THREE.Vector3(0, 0, 0);
    if (playerObjRef.current) playerObjRef.current.getWorldPosition(playerPos);

    const currentObjects = objectsRef.current;
    const keptObjects: GameObject[] = [];
    const newSpawns: GameObject[] = [];

    for (const obj of currentObjects) {
        let moveAmount = dist;
        if (obj.type === ObjectType.MISSILE) moveAmount += MISSILE_SPEED * safeDelta;
        const prevZ = obj.position[2];
        obj.position[2] += moveAmount;
        
        // Scarecrow Logic
        if (obj.type === ObjectType.ALIEN && obj.active && !obj.hasFired) {
             if (obj.position[2] > -90) {
                 obj.hasFired = true;
                 newSpawns.push({
                     id: uuidv4(),
                     type: ObjectType.MISSILE,
                     position: [obj.position[0], 1.0, obj.position[2] + 2],
                     active: true,
                     color: '#8b0000'
                 });
                 hasChanges = true;
             }
        }

        let keep = true;
        if (obj.active) {
            const zThreshold = 2.0; 
            const inZZone = (prevZ < playerPos.z + zThreshold) && (obj.position[2] > playerPos.z - zThreshold);
            
            if (obj.type === ObjectType.SHOP_PORTAL) {
                const dz = Math.abs(obj.position[2] - playerPos.z);
                if (dz < 2) { 
                     openShop();
                     obj.active = false;
                     hasChanges = true;
                     keep = false; 
                }
            } else if (inZZone) {
                const dx = Math.abs(obj.position[0] - playerPos.x);
                if (dx < 0.9) { 
                     const isDamageSource = obj.type === ObjectType.OBSTACLE || obj.type === ObjectType.ALIEN || obj.type === ObjectType.MISSILE;
                     
                     if (isDamageSource) {
                         const playerBottom = playerPos.y;
                         const playerTop = playerPos.y + 1.6; 

                         let objBottom = obj.position[1] - 0.5;
                         let objTop = obj.position[1] + 0.5;

                         if (obj.type === ObjectType.OBSTACLE) {
                             objBottom = 0;
                             objTop = 1.4; // Hay bale height
                         } else if (obj.type === ObjectType.MISSILE) {
                             objBottom = 0.5;
                             objTop = 1.5;
                         }

                         if ((playerBottom < objTop) && (playerTop > objBottom)) { 
                             window.dispatchEvent(new Event('player-hit'));
                             obj.active = false; 
                             hasChanges = true;
                             window.dispatchEvent(new CustomEvent('particle-burst', { 
                                detail: { position: obj.position, color: '#deb887' } // Hay color
                             }));
                         }
                     } else {
                         const dy = Math.abs(obj.position[1] - playerPos.y);
                         if (dy < 2.5) { 
                            if (obj.type === ObjectType.GEM) {
                                collectGem(obj.points || 50);
                                audio.playGemCollect();
                            }
                            if (obj.type === ObjectType.LETTER && obj.targetIndex !== undefined) {
                                collectLetter(obj.targetIndex);
                                audio.playLetterCollect();
                            }
                            
                            window.dispatchEvent(new CustomEvent('particle-burst', { 
                                detail: { position: obj.position, color: obj.color || '#ff9900' } 
                            }));

                            obj.active = false;
                            hasChanges = true;
                         }
                     }
                }
            }
        }

        if (obj.position[2] > REMOVE_DISTANCE) {
            keep = false;
            hasChanges = true;
        }
        if (keep) keptObjects.push(obj);
    }

    if (newSpawns.length > 0) keptObjects.push(...newSpawns);

    // Spawning
    let furthestZ = 0;
    const staticObjects = keptObjects.filter(o => o.type !== ObjectType.MISSILE);
    
    if (staticObjects.length > 0) {
        furthestZ = Math.min(...staticObjects.map(o => o.position[2]));
    } else {
        furthestZ = -20;
    }

    if (furthestZ > -SPAWN_DISTANCE) {
         const minGap = 12 + (speed * 0.4); 
         const spawnZ = Math.min(furthestZ - minGap, -SPAWN_DISTANCE);
         const isLetterDue = distanceTraveled.current >= nextLetterDistance.current;

         if (isLetterDue) {
             const lane = getRandomLane(laneCount);
             const availableIndices = TARGET_WORD.map((_, i) => i).filter(i => !collectedLetters.includes(i));

             if (availableIndices.length > 0) {
                 const chosenIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
                 const val = TARGET_WORD[chosenIndex];
                 const color = THEME_COLORS[chosenIndex];

                 keptObjects.push({
                    id: uuidv4(),
                    type: ObjectType.LETTER,
                    position: [lane * LANE_WIDTH, 1.0, spawnZ], 
                    active: true,
                    color: color,
                    value: val,
                    targetIndex: chosenIndex
                 });
                 nextLetterDistance.current += getLetterInterval(level);
                 hasChanges = true;
             } else {
                keptObjects.push({
                    id: uuidv4(),
                    type: ObjectType.GEM,
                    position: [lane * LANE_WIDTH, 1.2, spawnZ],
                    active: true,
                    color: '#ff9900',
                    points: 50
                });
                hasChanges = true;
             }

         } else if (Math.random() > 0.1) { 
            const isObstacle = Math.random() > 0.20;
            if (isObstacle) {
                const spawnAlien = level >= 2 && Math.random() < 0.2; 

                if (spawnAlien) {
                    keptObjects.push({
                        id: uuidv4(),
                        type: ObjectType.ALIEN,
                        position: [getRandomLane(laneCount) * LANE_WIDTH, 0, spawnZ],
                        active: true,
                        color: '#8b4513',
                        hasFired: false
                    });
                } else {
                    const lane = getRandomLane(laneCount);
                    keptObjects.push({
                        id: uuidv4(),
                        type: ObjectType.OBSTACLE,
                        position: [lane * LANE_WIDTH, 0.7, spawnZ],
                        active: true,
                        color: '#deb887'
                    });
                    if (Math.random() < 0.3) {
                             keptObjects.push({
                                id: uuidv4(),
                                type: ObjectType.GEM,
                                position: [lane * LANE_WIDTH, 2.4, spawnZ],
                                active: true,
                                color: '#ff9900',
                                points: 100
                            });
                    }
                }
            } else {
                const lane = getRandomLane(laneCount);
                keptObjects.push({
                    id: uuidv4(),
                    type: ObjectType.GEM,
                    position: [lane * LANE_WIDTH, 1.2, spawnZ],
                    active: true,
                    color: '#ff9900',
                    points: 50
                });
            }
            hasChanges = true;
         }
    }

    if (hasChanges) {
        objectsRef.current = keptObjects;
        setRenderTrigger(t => t + 1);
    }
  });

  return (
    <group>
      <ParticleSystem />
      {objectsRef.current.map(obj => {
        if (!obj.active) return null;
        return <GameEntity key={obj.id} data={obj} />;
      })}
    </group>
  );
};

const GameEntity: React.FC<{ data: GameObject }> = React.memo(({ data }) => {
    const groupRef = useRef<THREE.Group>(null);
    const visualRef = useRef<THREE.Group>(null);
    const { laneCount } = useStore();
    
    useFrame((state, delta) => {
        if (groupRef.current) groupRef.current.position.set(data.position[0], 0, data.position[2]);
        if (visualRef.current) {
            const baseHeight = data.position[1];
            if (data.type === ObjectType.GEM) {
                visualRef.current.rotation.y += delta * 2;
                visualRef.current.position.y = baseHeight + Math.sin(state.clock.elapsedTime * 3) * 0.1;
            } else if (data.type === ObjectType.MISSILE) {
                visualRef.current.rotation.z += delta * 10; 
                visualRef.current.position.y = baseHeight;
            } else {
                visualRef.current.position.y = baseHeight;
            }
        }
    });

    return (
        <group ref={groupRef} position={[data.position[0], 0, data.position[2]]}>
            {data.type !== ObjectType.SHOP_PORTAL && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} geometry={SHADOW_DEFAULT_GEO}>
                    <meshBasicMaterial color="#221100" opacity={0.4} transparent />
                </mesh>
            )}

            <group ref={visualRef} position={[0, data.position[1], 0]}>
                {/* --- SHOP PORTAL --- */}
                {data.type === ObjectType.SHOP_PORTAL && (
                    <group>
                         <mesh position={[0, 3, 0]} geometry={SHOP_FRAME_GEO} scale={[laneCount * LANE_WIDTH + 2, 1, 1]}>
                             <meshStandardMaterial color="#5c3a21" />
                         </mesh>
                         <mesh position={[0, 2, 0]} geometry={SHOP_BACK_GEO} scale={[laneCount * LANE_WIDTH, 1, 1]}>
                              <meshBasicMaterial color="#000000" />
                         </mesh>
                         <Center position={[0, 5, 0.6]}>
                             <Text3D font={FONT_URL} size={1.2} height={0.2}>
                                 FARM MARKET
                                 <meshBasicMaterial color="#ffcc00" />
                             </Text3D>
                         </Center>
                    </group>
                )}

                {/* --- OBSTACLE (HAY BALE) --- */}
                {data.type === ObjectType.OBSTACLE && (
                    <mesh geometry={HAY_GEO} castShadow receiveShadow>
                         <meshStandardMaterial color="#deb887" roughness={1} /> 
                    </mesh>
                )}

                {/* --- ALIEN (SCARECROW) --- */}
                {data.type === ObjectType.ALIEN && (
                    <group position={[0, 1.5, 0]}>
                        <mesh geometry={SCARECROW_POLE} material={new THREE.MeshStandardMaterial({color: '#8b4513'})} />
                        <mesh position={[0, 0.5, 0]} geometry={SCARECROW_ARM} rotation={[0,0,Math.PI/2]} material={new THREE.MeshStandardMaterial({color: '#8b4513'})} />
                        <mesh position={[0, 0.5, 0]} geometry={SCARECROW_BODY} material={new THREE.MeshStandardMaterial({color: '#cd5c5c'})} />
                        <mesh position={[0, 0.9, 0]} geometry={SCARECROW_HEAD} material={new THREE.MeshStandardMaterial({color: '#deb887'})} />
                    </group>
                )}

                {/* --- MISSILE (PITCHFORK) --- */}
                {data.type === ObjectType.MISSILE && (
                    <group rotation={[Math.PI / 2, 0, 0]}>
                        <mesh geometry={FORK_HANDLE} material={new THREE.MeshStandardMaterial({color: '#8b4513'})} />
                        <mesh position={[0, 1.2, 0]} geometry={FORK_HEAD} material={new THREE.MeshStandardMaterial({color: '#708090'})} />
                    </group>
                )}

                {/* --- GEM (PUMPKIN PIE) --- */}
                {data.type === ObjectType.GEM && (
                    <group rotation={[0.5, 0, 0]}>
                        <mesh geometry={PIE_GEO} material={new THREE.MeshStandardMaterial({color: '#ff8c00'})} />
                        <mesh position={[0, -0.1, 0]} geometry={PIE_CRUST_GEO} material={new THREE.MeshStandardMaterial({color: '#deb887'})} />
                        {/* Whipped Cream */}
                        <mesh position={[0, 0.15, 0]}>
                            <sphereGeometry args={[0.1, 8, 8]} />
                            <meshBasicMaterial color="white" />
                        </mesh>
                    </group>
                )}

                {/* --- LETTER --- */}
                {data.type === ObjectType.LETTER && (
                    <group scale={[1.5, 1.5, 1.5]}>
                         <Center>
                             <Text3D 
                                font={FONT_URL} 
                                size={0.8} 
                                height={0.2} 
                             >
                                {data.value}
                                <meshStandardMaterial color={data.color} emissive={data.color} emissiveIntensity={0.5} />
                             </Text3D>
                         </Center>
                    </group>
                )}
            </group>
        </group>
    );
});
